"use client";

import { containsSensitiveCredentialPayload } from "@idbrf/shared";
import { useState } from "react";
import { AppShell } from "../../../../components/AppShell";
import { DemoLogin } from "../../../../components/DemoLogin";
import { apiGet, loadStoredToken } from "../../../../lib/api";
import { withBasePath } from "../../../../lib/paths";
import styles from "../../workspace.module.css";

interface CardPayload {
  id: string;
  status: string;
  displayName: string;
  churchName: string;
  qrPayload: string;
  issuedAt: string;
  revokedAt: string | null;
  personId: string;
  membershipId: string;
}
interface CredentialMeResponse {
  card: CardPayload | null;
  church: { name: string; slug: string };
}
function ChurchEmblem() {
  return (
    <svg width="30" height="34" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M20 4h6v16h14v6H26v17h-6V26H7v-6h13V4Z" fill="currentColor"/>
      <path d="M34 8c-3 6-1 11 1 15 3 6 3 12-1 18 8-4 12-12 9-20-1-4-6-8-9-13Z" fill="currentColor"/>
    </svg>
  );
}
function CardArt({ name, church, token, date, preview = false }: { name: string; church: string; token?: string; date?: string; preview?: boolean }) {
  return (
    <article className={styles.bigCard} aria-label={preview ? "Modelo visual ilustrativo da carteirinha" : "Carteirinha digital do membro"}>
      <div className={styles.cardTop}>
        <div className={styles.cardMark}><ChurchEmblem/></div>
        <div className={styles.cardBrand}>IGREJA DE DEUS<small>NO RIACHO FUNDO I</small></div>
      </div>
      <div>
        <p className={styles.cardLabel}>{preview ? "Prévia do design · não é documento" : "Identificação eclesiástica"}</p>
        <h3 className={styles.cardName}>{name}</h3>
        <p style={{ fontSize: ".78rem", color: "#f1dcaf", margin: 0 }}>{church}</p>
      </div>
      <div className={styles.cardBottom}>
        <span>{preview ? "MODELO ILUSTRATIVO" : "MEMBRESIA ATIVA"}</span>
        <span>{date ? "Emissão: " + date : "Cruz · Família · Missão"}</span>
      </div>
      {token && <span style={{ position: "absolute", inset: "auto 0 0 auto", opacity: 0, pointerEvents: "none" }} aria-hidden="true">{token.length} caracteres</span>}
    </article>
  );
}

export default function CarteirinhaPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<CredentialMeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCard(accessToken: string) {
    setToken(accessToken);
    setBusy(true);
    setError(null);
    try {
      const result = await apiGet<CredentialMeResponse>("/credentials/me", accessToken);
      if (result.card && containsSensitiveCredentialPayload(result.card.qrPayload)) {
        setError("O identificador de validação retornou informações inadequadas; a carteirinha não será apresentada.");
        setData(null);
        return;
      }
      setData(result);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Não foi possível carregar a carteirinha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell active="carteirinha" meta="Identificação digital · Riacho Fundo I">
      <div className={styles.root}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Comunhão · Identidade · Membresia</p>
            <h1>Carteirinha digital</h1>
            <p>Um documento de identificação eclesiástica vinculado à membresia aprovada, com validação e revogação controladas.</p>
          </div>
          <span className={styles.smallFlag}>{data?.card ? "Carteirinha localizada" : "Apresentação da funcionalidade"}</span>
        </header>

        <section className={styles.hero} aria-label="Identificação dos membros">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroImage} src={withBasePath("/images/hero-oficial.jpg")} alt="" width={928} height={1192} />
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}>Uma família de fé</p>
            <h2>Mais que um registro. Uma história de pertencimento.</h2>
            <p>A identificação digital deverá ser emitida somente após o processo de admissão e a confirmação das aprovações pela igreja.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href={withBasePath("/app/demo/")}>Ver demonstração da carteirinha</a>
              <a className={styles.lightButton} href={withBasePath("/app/membros/")}>Membros e famílias</a>
            </div>
          </div>
        </section>

        <div className={styles.columns}>
          <section className={styles.panel} aria-label="Carteirinha e acesso">
            <div className={styles.panelTitle}>
              <div><h2>{data?.card ? "Sua identificação" : "Modelo de carteirinha"}</h2><p>{data?.card ? "Dados retornados pela API autenticada." : "Visualização ilustrativa com a identidade da igreja."}</p></div>
              {token && <button className={styles.secondary} disabled={busy} type="button" onClick={() => void loadCard(token)}>{busy ? "Atualizando..." : "Atualizar"}</button>}
            </div>
            <CardArt
              name={data?.card?.displayName ?? "Sua identificação"}
              church={data?.card?.churchName ?? "Igreja de Deus no Riacho Fundo I"}
              token={data?.card?.qrPayload}
              date={data?.card?.issuedAt ? new Date(data.card.issuedAt).toLocaleDateString("pt-BR") : undefined}
              preview={!data?.card}
            />
            {data?.card && (
              <>
                <dl className={styles.detailList}>
                  <div><dt>Situação da carteirinha</dt><dd>{data.card.status === "ACTIVE" ? "Ativa" : data.card.status}</dd></div>
                  <div><dt>Data da emissão</dt><dd>{new Date(data.card.issuedAt).toLocaleDateString("pt-BR")}</dd></div>
                </dl>
                <h3 className={styles.connectHeading}>Código de validação</h3>
                <code className={styles.code}>{data.card.qrPayload}</code>
                <p className={styles.caption}>O código é um token opaco. A representação visual em QR Code e sua impressão ficam pendentes da integração segura com o backend.</p>
              </>
            )}
            {!data?.card && <p className={styles.caption}>Esta prévia não é uma carteirinha válida. O código real e a situação da membresia são fornecidos pela API; não há emissão automática no navegador.</p>}
            {busy && <p className={styles.notice} role="status">Consultando sua identificação...</p>}
            {error && <p className={styles.notice} role="alert">{error}</p>}
            {token && !busy && data && !data.card && <p className={styles.notice} role="status">Nenhuma carteirinha ativa encontrada para esta conta.</p>}
          </section>

          <aside className={styles.panel} aria-label="Consulta de carteirinha">
            <p className={styles.eyebrow}>Acesso individual</p>
            <h2 className={styles.connectHeading}>Consulte com segurança</h2>
            <p className={styles.panelText}>No ambiente operacional, cada membro visualiza somente a sua própria carteirinha. O perfil ilustrativo da demonstração não concede acesso a terceiros.</p>
            {!token ? (
              <div className={styles.connectPanel}>
                <DemoLogin hintEmail="bruno.demo@example.test" onAuthenticated={(accessToken) => void loadCard(accessToken)} />
                <button className={styles.secondary} type="button" onClick={() => {
                  const stored = loadStoredToken();
                  if (stored) void loadCard(stored);
                  else setError("Nenhuma sessão salva neste navegador.");
                }}>Usar sessão existente</button>
              </div>
            ) : (
              <div className={styles.softPanel}>
                <strong>Consulta autenticada</strong>
                <p>Você está utilizando o token de sessão deste navegador para consultar a API configurada.</p>
              </div>
            )}
            <div className={styles.softPanel} style={{ marginTop: "1rem" }}>
              <strong>Importante</strong>
              <p>GitHub Pages não hospeda a API nem permite emitir documentos reais. Para experimentar o processo de emissão e revogação sem autenticação, abra a versão demonstrativa.</p>
              <a className={styles.secondary} href={withBasePath("/app/demo/")}>Explorar versão fictícia</a>
            </div>
          </aside>
        </div>
        <p className={styles.note}>A validação do identificador deve consultar o estado atual no servidor. Nenhum token é enviado a serviços externos de geração de imagens.</p>
      </div>
    </AppShell>
  );
}
