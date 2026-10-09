pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  environment {
    COMPOSE_BIN = 'docker compose'
  }

  stages {
    stage('Checkout') {
      steps {
        script {
          env.GIT_SHA = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.APP_VERSION = sh(
            script: '''sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' backend/package.json | head -n 1''',
            returnStdout: true
          ).trim()
          env.IMAGE_TAG = "${env.APP_VERSION}.${env.BUILD_NUMBER}"
          env.IMAGE_GIT = "git-${env.GIT_SHA}"
          env.IS_PRODUCTION = (env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'master') ? '1' : '0'
          env.IS_STAGING = (env.BRANCH_NAME == 'develop' || env.BRANCH_NAME == 'dev_run') ? '1' : '0'
          echo "Commit ${env.GIT_SHA} image ${env.IMAGE_TAG} (${env.IMAGE_GIT})"
        }
      }
    }

    stage('Install') {
      steps {
        sh 'chmod +x deploy/ci-node.sh && ./deploy/ci-node.sh npm ci'
      }
    }

    stage('Lint') {
      steps {
        sh './deploy/ci-node.sh npm run lint'
      }
    }

    stage('Test') {
      steps {
        sh './deploy/ci-node.sh npm test'
      }
    }

    stage('Build') {
      steps {
        sh './deploy/ci-node.sh npm run build'
      }
    }

    stage('Admin Build') {
      steps {
        script {
          runStage('Admin Build', {
            sh '''
              chmod +x deploy/ci-node.sh deploy/deploy-admin.sh
              CI_DIR=admin ./deploy/ci-node.sh npm ci
              CI_DIR=admin ./deploy/ci-node.sh npm run build
              test -f admin/dist/index.html
            '''
          })
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          runStage('Docker Build', {
            sh '''
              docker build -f backend/Dockerfile \
                -t "runbonus-api:${IMAGE_TAG}" \
                -t "runbonus-api:${IMAGE_GIT}" \
                -t "runbonus-api:${APP_VERSION}" \
                .
            '''
            try {
              withCredentials([usernamePassword(credentialsId: 'DOCKER_REGISTRY', usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
                sh '''
                  echo "$REG_PASS" | docker login -u "$REG_USER" --password-stdin
                  docker tag "runbonus-api:${IMAGE_TAG}" "$REG_USER/runbonus-api:${IMAGE_TAG}"
                  docker tag "runbonus-api:${IMAGE_TAG}" "$REG_USER/runbonus-api:${IMAGE_GIT}"
                  docker push "$REG_USER/runbonus-api:${IMAGE_TAG}"
                  docker push "$REG_USER/runbonus-api:${IMAGE_GIT}"
                '''
              }
            } catch (ignored) {
              echo 'DOCKER_REGISTRY credential not configured — using local images'
            }
          })
        }
      }
    }

    stage('Deploy STAGING') {
      when {
        anyOf {
          branch 'develop'
          branch 'dev_run'
        }
      }
      steps {
        script {
          env.DEPLOY_ENV = 'staging'
          withTelegramCreds {
            runStage('Деплой STAGING', {
              sh '''
                chmod +x deploy/*.sh
                export RUNBONUS_ENV_FILE="${RUNBONUS_ENV_FILE:-/opt/runbonus/.env.staging}"
                ./deploy/prepare-env.sh .env.staging
                export COMPOSE_FILE=docker-compose.staging.yml
                export ENV_FILE=.env.staging
                export HEALTH_URL=http://127.0.0.1:8080/health
                export HEALTH_CONTAINER=runbonus-api-stage
                export MYSQL_CONTAINER=runbonus-mysql-stage
                export DEPLOY_ENV=staging
                export VERSION="${IMAGE_TAG}"
                export COMMIT="${GIT_SHA}"
                export BUILD_URL="${BUILD_URL}"
                export NOTIFY_DEPLOY_STAGES=1
                export SKIP_HEALTH_IN_DEPLOY=1
                ./deploy/remote-deploy.sh
              '''
              env.DEPLOY_STARTED = '1'
            })
          }
        }
      }
    }

    stage('Deploy PRODUCTION') {
      when {
        anyOf {
          branch 'main'
          branch 'master'
        }
      }
      steps {
        script {
          env.DEPLOY_ENV = 'production'
          withTelegramCreds {
            sh '''
              chmod +x deploy/*.sh
              ./deploy/prepare-env.sh
              export COMPOSE_FILE=docker-compose.prod.yml
              export ENV_FILE=.env
              export HEALTH_URL=http://127.0.0.1:3000/health
              export HEALTH_CONTAINER=runbonus-api
              export DEPLOY_ENV=production
              export VERSION="${IMAGE_TAG}"
              export COMMIT="${GIT_SHA}"
              export BUILD_URL="${BUILD_URL}"
              export NOTIFY_DEPLOY_STAGES=1
              export SKIP_HEALTH_IN_DEPLOY=1
              ./deploy/remote-deploy.sh
            '''
            runStage('Admin Deploy', {
              sh '''
                chmod +x deploy/deploy-admin.sh
                export ADMIN_DIST_DIR=/opt/runbonus/admin/dist
                ./deploy/deploy-admin.sh
              '''
            })
            env.DEPLOY_STARTED = '1'
          }
        }
      }
    }

    stage('Health Check') {
      when {
        anyOf {
          branch 'main'
          branch 'master'
          branch 'develop'
          branch 'dev_run'
        }
      }
      steps {
        script {
          runStage('Health Check', {
            sh '''
              export HEALTH_CONTAINER="${HEALTH_CONTAINER:-runbonus-api}"
              if [ "${IS_STAGING}" = "1" ]; then
                export HEALTH_CONTAINER=runbonus-api-stage
              fi
              export HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"
              ./deploy/health-wait.sh
            '''
          })
        }
      }
    }
  }

  post {
    success {
      echo 'RunBonus deployment successful'
      script { notifyTelegram('SUCCESS', '') }
    }
    failure {
      echo 'RunBonus deployment failed'
      script {
        if (env.DEPLOY_STARTED == '1' && env.IS_PRODUCTION == '1') {
          echo 'Attempting production rollback to previous image tag'
          sh './deploy/rollback.sh || true'
        }
        notifyTelegram('FAILED', env.STAGE_NAME ?: 'pipeline')
      }
    }
    always {
      sh 'docker image prune -f || true'
    }
  }
}

def runStage(String name, Closure body) {
  notifyTelegram('RUNNING', name)
  try {
    body()
    notifyTelegram('STAGE_OK', name)
  } catch (err) {
    notifyTelegram('STAGE_FAIL', name)
    throw err
  }
}

def withTelegramCreds(Closure body) {
  def started = false
  try {
    withCredentials([
      string(credentialsId: 'TELEGRAM_BOT_TOKEN', variable: 'TELEGRAM_BOT_TOKEN'),
      string(credentialsId: 'TELEGRAM_CHAT_ID', variable: 'TELEGRAM_CHAT_ID')
    ]) {
      started = true
      body()
    }
  } catch (err) {
    if (started) {
      throw err
    }
    echo 'Telegram credentials not configured — deploy continues without stage notifies'
    body()
  }
}

def notifyTelegram(status, stageName) {
  try {
    withCredentials([
      string(credentialsId: 'TELEGRAM_BOT_TOKEN', variable: 'TELEGRAM_BOT_TOKEN'),
      string(credentialsId: 'TELEGRAM_CHAT_ID', variable: 'TELEGRAM_CHAT_ID')
    ]) {
      sh """
        STATUS='${status}' \
        ENVIRONMENT='${env.DEPLOY_ENV ?: env.BRANCH_NAME}' \
        STAGE='${stageName}' \
        VERSION='${env.IMAGE_TAG}' \
        COMMIT='${env.GIT_SHA}' \
        BUILD_URL='${env.BUILD_URL}' \
        ./deploy/jenkins-notify.sh
      """
    }
  } catch (ignored) {
    echo 'Telegram credentials not configured — skip notify'
  }
}
