// CI/CD для API (backend/, Go). Админка и мобильное приложение собираются отдельно.
//
// Нужные credentials в Jenkins:
//   runbonus-registry  — Username/Password от Docker registry (если используется)
//   runbonus-deploy-ssh — SSH-ключ пользователя на production-сервере
// Параметры окружения задаются в job: REGISTRY, DEPLOY_HOST, DEPLOY_PATH.
pipeline {
  agent any

  parameters {
    booleanParam(name: 'DEPLOY', defaultValue: false, description: 'Выкатить на production после сборки')
  }

  environment {
    IMAGE = "${env.REGISTRY ?: 'runbonus'}/api"
    TAG = "${env.GIT_COMMIT?.take(8) ?: env.BUILD_NUMBER}"
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Test') {
      agent { docker { image 'golang:1.27-alpine'; reuseNode true } }
      steps {
        dir('backend') {
          sh 'go vet ./...'
          sh 'go test ./...'
        }
      }
    }

    stage('Build image') {
      steps {
        dir('backend') {
          sh 'docker build -t $IMAGE:$TAG -t $IMAGE:latest .'
        }
      }
    }

    stage('Push') {
      when { expression { env.REGISTRY } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'runbonus-registry', usernameVariable: 'U', passwordVariable: 'P')]) {
          sh 'echo "$P" | docker login "$REGISTRY" -u "$U" --password-stdin'
          sh 'docker push $IMAGE:$TAG && docker push $IMAGE:latest'
        }
      }
    }

    stage('Deploy') {
      when { expression { params.DEPLOY } }
      steps {
        sshagent(credentials: ['runbonus-deploy-ssh']) {
          sh '''
            ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_HOST" "
              set -e
              cd $DEPLOY_PATH/backend
              git -C $DEPLOY_PATH pull --ff-only
              IMAGE=$IMAGE TAG=$TAG docker compose up -d --build api
              for i in 1 2 3 4 5 6 7 8 9 10; do
                curl -fsS http://127.0.0.1:3001/api/health && exit 0
                sleep 3
              done
              echo 'API не поднялся' >&2
              docker compose logs --tail=100 api
              exit 1
            "
          '''
        }
      }
    }
  }

  post {
    failure { echo 'Сборка или деплой API не прошли — production остаётся на прежней версии.' }
  }
}
