declare module "nodemailer" {
  export function createTransport(options: Record<string, unknown>): {
    sendMail(mail: Record<string, unknown>): Promise<{ messageId?: string }>;
  };
}
