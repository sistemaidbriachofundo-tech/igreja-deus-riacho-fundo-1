import type { Metadata } from "next";
import { LoginScreen } from "../../components/LoginScreen";

export const metadata: Metadata = {
  title: "Login — ID Riacho 1",
  description: "Entre com e-mail e senha antes de acessar a área administrativa da Igreja de Deus no Riacho Fundo I.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginScreen/>;
}
