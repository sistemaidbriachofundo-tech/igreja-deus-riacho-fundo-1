import type { Metadata } from "next";
import Link from "next/link";
import { UIIcon } from "../components/ui/UIIcon";
import ui from "../components/ui/ui.module.css";
import s from "./not-found.module.css";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <main className={s.page}>
      <div className={s.content}>
        <span className={s.icon}><UIIcon name="search" size={28} /></span>
        <h1>Página não encontrada</h1>
        <p>O endereço pode ter mudado. Volte ao início ou acesse o painel.</p>
        <div className={s.actions}>
          <Link href="/" className={ui.workspacePrimary}>Voltar ao início</Link>
          <Link href="/login/" className={ui.workspaceQuiet}>Acessar o painel</Link>
        </div>
      </div>
    </main>
  );
}
