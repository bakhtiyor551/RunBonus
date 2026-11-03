// CI/CD API RunBonus (Go) на этом же сервере.
// Собирает образ и поднимает api в стеке docker-compose.prod.yml (mysql/redis).
pipeline {
  agent any

  parameters {
    booleanParam(name: 'DEPLOY', defaultValue: true, description: 'Выкатить api после сборки')
  }

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  environment {
    IMAGE_TAG = "${env.GIT_COMMIT?.take(8) ?: env.BUILD_NUMBER}"
  }

  stages {
    stage('Checkout meta') {
      steps {
        script {
          env.GIT_SHA = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.IMAGE_TAG = "git-${env.GIT_SHA}"
          echo "Commit ${env.GIT_SHA}"
        }
      }
    }

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
        sh '''
          docker build -t "runbonus-api:${IMAGE_TAG}" -t runbonus-api:latest ./backend
        '''
      }
    }

    stage('Deploy') {
      when { expression { return params.DEPLOY } }
      steps {
        sh '''
          set -e
          export IMAGE_TAG="${IMAGE_TAG}"
          docker compose -f docker-compose.prod.yml up -d --build api
          for i in 1 2 3 4 5 6 7 8 9 10; do
            if curl -fsS http://127.0.0.1:3000/api/health; then
              echo
              exit 0
            fi
            sleep 3
          done
          echo 'API не поднялся' >&2
          docker compose -f docker-compose.prod.yml logs --tail=100 api
          exit 1
        '''
      }
    }
  }

  post {
    failure { echo 'Сборка или деплой API не прошли — production остаётся на прежней версии.' }
  }
}
