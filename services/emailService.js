const nodemailer = require('nodemailer');

/**
 * Cria um transporter baseado no ambiente.
 * Para uma microempresa começando, se ela não tiver servidor de SMTP configurado (Gmail, AWS, etc)
 * O servidor utilizará uma conta Ethereal.email instantânea fake (Mock) que gera 
 * links de visualização perfeita no terminal, permitindo testes sem pagar nada.
 */
const getTransporter = async () => {
    // Tenta produção (Configuração Real de Empresa)
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }

    // Fallback: Ambiente de Teste (Mock Ethereal gratuito, ideal para Startups MVP)
    console.log('🤖 [Email Service] Gerando credenciais locais de teste via Ethereal...');
    const testAccount = await nodemailer.createTestAccount();
    
    return nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user, // gerado dinamicamente
            pass: testAccount.pass  // gerado dinamicamente
        }
    });
};

/**
 * Dispara o e-mail transacional de "Boas-Vindas" tipo Chatbot.
 */
exports.enviarBoasVindas = async (emailDestino, nomeUsuario) => {
    try {
        const transporter = await getTransporter();
        const primeiroNome = nomeUsuario.split(' ')[0];

        // Corpo em HTML com a Persona do Chatbot e cores oficiais
        const htmlBody = `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f9fa; color: #213448; border-radius: 12px; border: 1px solid #e0e5e9;">
            <div style="background-color: #213448; color: #EAE0CF; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">Hidra<span style="color: #94B4C1;">pe</span></h1>
            </div>
            
            <div style="padding: 32px 24px; background-color: #ffffff; border-radius: 0 0 12px 12px;">
                <h2 style="color: #547792;">Beep Boop! 🤖</h2>
                <p style="font-size: 16px; line-height: 1.5;">Olá, <strong>${primeiroNome}</strong>!</p>
                <p style="font-size: 16px; line-height: 1.5;">
                    Eu sou o Bot assistente da sala de máquinas da Hidrape. Acabei de receber o sinal de que você registrou a sua planta em nossos servidores! 🎉
                </p>
                
                <div style="background-color: rgba(148, 180, 193, 0.1); padding: 16px; border-left: 4px solid #547792; border-radius: 4px; margin: 24px 0;">
                    <p style="margin: 0; font-style: italic;">"Meu trabalho aqui é monitorar os seus sensores 24h por dia e avisar sua equipe no WhatsApp caso a umidade abaixe bruscamente!"</p>
                </div>

                <p style="font-size: 16px; line-height: 1.5;">
                    Sua conta está ativa e pronta. Vá até o seu <a href="http://localhost:3002" style="color: #547792; text-decoration: none; font-weight: bold;">Dashboard</a> para configurar os protocolos da Inteligência Artificial.
                </p>
                
                <p style="font-size: 16px; line-height: 1.5; margin-top: 32px;">
                    Câmbio e desligo,<br>
                    <strong>Equipe de Sistemas Autônomos Hidrape</strong> ⚙️
                </p>
            </div>
        </div>
        `;

        const info = await transporter.sendMail({
            from: '"Hidrape Bot 🤖" <bot@hidrape.com.br>',
            to: emailDestino,
            subject: 'Registro Confirmado! Bem-vindo à Hidrape 🚢',
            text: `Olá, ${primeiroNome}! Eu sou o Bot assistente da Hidrape. Sua conta foi criada com sucesso!`, // plain text alternative
            html: htmlBody // html body
        });

        console.log(`✉️ Email "Chatbot" enviado para: ${info.messageId}`);
        
        // Se estiver usando Ethereal (Test Mode), o Nodemailer emite a URL Preview no console
        if (info.messageId && nodemailer.getTestMessageUrl(info)) {
            console.log('👀 [AÇÃO REQUERIDA] Veja como o seu E-mail ficou (Clique no link):');
            console.log('\x1b[36m%s\x1b[0m', nodemailer.getTestMessageUrl(info)); 
        }

    } catch (error) {
        console.error('❌ Falha ao tentar disparar o E-mail de Boas-Vindas:', error);
    }
};

/**
 * Dispara o e-mail transacional de Recuperação de Senha.
 */
exports.enviarRecuperacaoSenha = async (emailDestino, nomeUsuario, resetToken) => {
    try {
        const transporter = await getTransporter();
        const primeiroNome = nomeUsuario.split(' ')[0];
        const resetUrl = `http://localhost:3002/reset-password.html?token=${resetToken}`;

        const htmlBody = `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f9fa; color: #213448; border-radius: 12px; border: 1px solid #e0e5e9;">
            <div style="background-color: #213448; color: #EAE0CF; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">Hidra<span style="color: #94B4C1;">pe</span></h1>
            </div>
            
            <div style="padding: 32px 24px; background-color: #ffffff; border-radius: 0 0 12px 12px;">
                <h2 style="color: #547792;">Recuperação de Senha 🔐</h2>
                <p style="font-size: 16px; line-height: 1.5;">Olá, <strong>${primeiroNome}</strong>!</p>
                <p style="font-size: 16px; line-height: 1.5;">
                    Recebemos um pedido para redefinir a sua senha no sistema da Hidrape.
                </p>
                
                <div style="text-align: center; margin: 32px 0;">
                    <a href="${resetUrl}" style="background-color: #547792; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">Redefinir Minha Senha</a>
                </div>

                <p style="font-size: 14px; line-height: 1.5; color: #666;">
                    Se o botão acima não funcionar, copie e cole o seguinte link no seu navegador:<br>
                    <a href="${resetUrl}" style="color: #547792;">${resetUrl}</a>
                </p>
                
                <p style="font-size: 14px; line-height: 1.5; color: #666; margin-top: 24px;">
                    * Este link é válido por 1 hora. Se você não solicitou essa alteração, pode ignorar este e-mail em segurança.
                </p>

                <p style="font-size: 16px; line-height: 1.5; margin-top: 32px;">
                    Câmbio e desligo,<br>
                    <strong>Equipe de Sistemas Autônomos Hidrape</strong> ⚙️
                </p>
            </div>
        </div>
        `;

        const info = await transporter.sendMail({
            from: '"Hidrape Suporte 🛠️" <suporte@hidrape.com.br>',
            to: emailDestino,
            subject: 'Redefinição de Senha - Hidrape',
            text: `Olá, ${primeiroNome}! Para redefinir sua senha, acesse: ${resetUrl}`,
            html: htmlBody
        });

        console.log(`✉️ Email de "Recuperação" enviado para: ${info.messageId}`);
        
        if (info.messageId && nodemailer.getTestMessageUrl(info)) {
            console.log('👀 [AÇÃO REQUERIDA] Veja o E-mail de Recuperação (Clique no link):');
            console.log('\x1b[36m%s\x1b[0m', nodemailer.getTestMessageUrl(info)); 
        }

    } catch (error) {
        console.error('❌ Falha ao tentar disparar o E-mail de Recuperação:', error);
    }
};
