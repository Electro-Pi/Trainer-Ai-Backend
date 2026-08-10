pipeline {
    agent any
    environment {
        HOST = "187.124.20.36"
        USER = "ubuntu"
        SCRIPT = "/home/ubuntu/projects/Trainer-Ai-Backend/deploy.sh"
    }
    stages {
        stage('Deploy') {
            steps {
                sshagent(['servercreds']) {
                    sh """
                    ssh -o StrictHostKeyChecking=no ${USER}@${HOST} 'bash ${SCRIPT}'
                    """
                }
            }
        }
    }
}
