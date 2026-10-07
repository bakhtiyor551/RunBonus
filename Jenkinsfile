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
        checkout scm
        script {
          env.GIT_SHA = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.APP_VERSION = sh(
            script: "node -p \"require('./backend/package.json').version\"",
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
        sh '''
          docker run --rm \
            -v "$PWD/backend":/app \
            -w /app \
            node:22-bookworm \
            npm ci
        '''
      }
    }

    stage('Lint') {
      steps {
        sh '''
          docker run --rm \
            -v "$PWD/backend":/app \
            -w /app \
            node:22-bookworm \
            npm run lint
        '''
      }
    }

    stage('Test') {
      steps {
        sh '''
          docker run --rm \
            -v "$PWD/backend":/app \
            -w /app \
            node:22-bookworm \
            npm test
        '''
      }
    }

    stage('Build') {
      steps {
        sh '''
          docker run --rm \
            -v "$PWD/backend":/app \
            -w /app \
            node:22-bookworm \
            npm run build
        '''
      }
    }

    stage('Docker Build') {
      steps {
        sh '''
          docker build -f backend/Dockerfile \
            -t "runbonus-api:${IMAGE_TAG}" \
            -t "runbonus-api:${IMAGE_GIT}" \
            -t "runbonus-api:${APP_VERSION}" \
            .
        '''
        script {
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
        script { env.DEPLOY_ENV = 'staging' }
        sh '''
          chmod +x deploy/*.sh
          test -f .env.staging || { echo "Create .env.staging on the agent from .env.staging.example"; exit 1; }
          export COMPOSE_FILE=docker-compose.staging.yml
          export ENV_FILE=.env.staging
          export HEALTH_URL=http://127.0.0.1:8080/health
          export SKIP_BACKUP=1
          ./deploy/remote-deploy.sh
        '''
        script { env.DEPLOY_STARTED = '1' }
      }
    }

    stage('Backup DB') {
      when {
        anyOf {
          branch 'main'
          branch 'master'
        }
      }
      steps {
        sh '''
          chmod +x deploy/*.sh
          ./deploy/backup-db.sh
        '''
      }
    }

    stage('Migration') {
      when {
        anyOf {
          branch 'main'
          branch 'master'
        }
      }
      steps {
        sh '''
          IMAGE_TAG="$IMAGE_TAG" docker compose --env-file .env -f docker-compose.prod.yml \
            run --rm --no-deps api node src/migrate.js
        '''
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
        script { env.DEPLOY_ENV = 'production' }
        sh '''
          chmod +x deploy/*.sh
          test -f .env || { echo "Create .env on the agent from .env.example (never commit it)"; exit 1; }
          export COMPOSE_FILE=docker-compose.prod.yml
          export ENV_FILE=.env
          export HEALTH_URL=http://127.0.0.1/health
          export SKIP_BACKUP=1
          export SKIP_MIGRATE=1
          ./deploy/remote-deploy.sh
        '''
        script { env.DEPLOY_STARTED = '1' }
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
          def url = (env.IS_PRODUCTION == '1') ? 'http://127.0.0.1/health' : 'http://127.0.0.1:8080/health'
          if (env.IS_PRODUCTION != '1' && env.IS_STAGING != '1') {
            url = 'http://127.0.0.1/health'
          }
          sh "./deploy/health-wait.sh ${url}"
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
