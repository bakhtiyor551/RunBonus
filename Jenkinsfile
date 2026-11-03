// CI/CD для Go API (backend-go). Node-бэкенд и админка собираются как раньше.
//
// Нужные credentials в Jenkins:
//   runbonus-registry  — Username/Password от Docker registry (если используется)
//   runbonus-deploy-ssh — SSH-ключ пользователя на production-сервере
// Параметры окружения задаются в job: REGISTRY, DEPLOY_HOST, DEPLOY_PATH.
pipeline {
  agent any

  parameters {
    choice(name: 'GO_MODULES', choices: ['all', 'auth', 'auth,shoes', 'auth,shoes,workouts,progress',
      'auth,shoes,workouts,progress,rewards,challenges', 'auth,shoes,workouts,progress,rewards,challenges,shop,ads,push', 'none'], description: 'Модули, которые обслуживает Go')
    booleanParam(name: 'DEPLOY', defaultValue: false, description: 'Выкатить на production после сборки')
  }

  environment {
    IMAGE = "${env.REGISTRY ?: 'runbonus'}/api-go"
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
        dir('backend-go') {
          sh 'go vet ./...'
          sh 'go test ./...'
        }
      }
    }

    stage('Build image') {
      steps {
        dir('backend-go') {
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
              cd $DEPLOY_PATH/backend-go
              git -C $DEPLOY_PATH pull --ff-only
              IMAGE=$IMAGE TAG=$TAG GO_MODULES=$GO_MODULES docker compose up -d --build api-go
              for i in 1 2 3 4 5 6 7 8 9 10; do
                curl -fsS http://127.0.0.1:8080/api/health && exit 0
                sleep 3
              done
              echo 'Go API не поднялся' >&2
              docker compose logs --tail=100 api-go
              exit 1
            "
          '''
        }
      }
    }
  }

  post {
    failure { echo 'Сборка или деплой Go API не прошли — production остаётся на прежней версии.' }
  }
}
