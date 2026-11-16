"use client";

import { useEffect, useRef, useState } from "react";
import { validRegistrationCode } from "../../lib/public-event-registration";
import { Modal } from "../ui";

export function EventQrScanner({ onRead }: { onRead: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  useEffect(() => {
    if (!open) return;
    let active = true;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const element = video.current;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    async function start() {
      try {
        if (!element || !context || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("camera unavailable");
        }
        const { default: scan } = await import("jsqr");
        if (!active) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!active) { stream.getTracks().forEach(track => track.stop()); return; }
        element.srcObject = stream;
        await element.play();
        if (!active) return;
        setMessage("Aponte a câmera para o QR do ingresso.");
        const scanFrame = () => {
          if (!active) return;
          if (element.videoWidth && element.videoHeight) {
            canvas.width = Math.min(640, element.videoWidth);
            canvas.height = Math.round(canvas.width * element.videoHeight / element.videoWidth);
            context.drawImage(element, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const result = scan(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
            if (result && validRegistrationCode(result.data)) {
              onReadRef.current(result.data);
              setOpen(false);
              return;
            }
          }
          timer = setTimeout(scanFrame, 160);
        };
        scanFrame();
      } catch {
        if (active) setMessage("Câmera indisponível. Feche esta janela e digite o código do ingresso.");
        stream?.getTracks().forEach(track => track.stop());
      }
    }
    void start();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (element) element.srcObject = null;
    };
  }, [open]);

  return <>
    <button type="button" onClick={() => { setMessage("Abrindo a câmera…"); setOpen(true); }}>Ler QR com a câmera</button>
    <Modal open={open} appearance="workspace" title="Ler QR do ingresso" onClose={() => setOpen(false)}>
      <video ref={video} muted playsInline style={{ width: "100%", maxHeight: 360 }} aria-label="Imagem da câmera" />
      <p role="status">{message}</p>
    </Modal>
  </>;
}
