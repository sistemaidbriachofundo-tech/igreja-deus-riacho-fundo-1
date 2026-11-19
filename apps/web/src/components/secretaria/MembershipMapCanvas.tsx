"use client";

import type { MembershipMapRegion } from "@idbrf/shared";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { useEffect, useRef, useState } from "react";
import { UIIcon } from "../ui/UIIcon";
import "leaflet/dist/leaflet.css";
import s from "./membership-map.module.css";

// Templo público já referenciado no Waze pelo portal do ID Riacho 1.
const temple: L.LatLngTuple = [-15.889280625, -48.016895451];
const defaultBounds: L.LatLngBoundsExpression = [[-15.932, -48.087], [-15.848, -47.962]];
const format = new Intl.NumberFormat("pt-BR");

const tileSources = {
  map: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maximumZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
    maximumZoom: 13,
    attribution: '<a href="https://cloudless.eox.at/" target="_blank" rel="noopener noreferrer">EOxCloudless</a> · Copernicus Sentinel 2016 (CC BY 4.0)',
  },
};

function fitRegions(map: L.Map, regions: MembershipMapRegion[]) {
  const bounds = regions.length === 0
    ? defaultBounds
    : L.latLngBounds([temple, ...regions.map(({ latitude, longitude }): L.LatLngTuple => [latitude, longitude])]);
  map.fitBounds(bounds, { padding: [39, 43], maxZoom: 14, animate: false });
}

export function MembershipMapCanvas({ regions, statusLabel }: { regions: MembershipMapRegion[]; statusLabel: string }) {
  const frame = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const templeSymbol = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const [map, setMap] = useState<L.Map>();
  const [layer, setLayer] = useState<keyof typeof tileSources>("map");
  const [tileIssue, setTileIssue] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>();
  const [expanded, setExpanded] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const selected = selectedId === null ? undefined : regions.find(region => region.id === selectedId) ?? regions[0];

  useEffect(() => {
    if (!viewport.current) return;
    const next = L.map(viewport.current, {
      zoomControl: false, minZoom: 8, maxZoom: 18, zoomSnap: .25,
      scrollWheelZoom: true, attributionControl: true,
    });
    next.attributionControl.setPrefix(false);
    const churchIcon = templeSymbol.current?.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    L.marker(temple, {
      icon: L.divIcon({ className: s.temple, html: churchIcon, iconSize: [30, 30], iconAnchor: [4, 15] }),
      title: "Templo ID Riacho 1", interactive: false, keyboard: false,
    }).addTo(next);
    const observer = new ResizeObserver(() => next.invalidateSize({ pan: false }));
    observer.observe(viewport.current);
    const change = () => setFullScreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", change);
    setMap(next);
    return () => {
      fitted.current = false;
      observer.disconnect();
      document.removeEventListener("fullscreenchange", change);
      next.remove();
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    const source = tileSources[layer];
    setTileIssue(false);
    let succeeded = false;
    const tiles = L.tileLayer(source.url, { maxNativeZoom: source.maximumZoom, attribution: source.attribution });
    tiles.on("tileerror", () => { if (!succeeded) setTileIssue(true); });
    tiles.on("tileload", () => { succeeded = true; setTileIssue(false); });
    tiles.addTo(map);
    return () => { tiles.off(); tiles.remove(); };
  }, [map, layer]);

  useEffect(() => {
    if (!map || !tileIssue) return;
    let active = true;
    let boundaries: L.GeoJSON | undefined;
    // Limites oficiais do Distrito Federal (Brasília Ambiental, 2025).
    void import("./membership-map-df-boundaries.json").then(data => {
      if (!active) return;
      boundaries = L.geoJSON(data.default as GeoJsonObject, {
        interactive: false,
        style: { color: "#658477", weight: 1.5, fillColor: "#a6b9a9", fillOpacity: .32 },
        attribution: '<a href="https://onda.ibram.df.gov.br/server/rest/services/Territorio/Regioes_Administrativas_DF_2025/FeatureServer" target="_blank" rel="noopener noreferrer">Limites do DF · Brasília Ambiental</a>',
      }).addTo(map);
    });
    return () => { active = false; boundaries?.remove(); };
  }, [map, tileIssue]);

  useEffect(() => {
    if (!map) return;
    if (!fitted.current) {
      fitRegions(map, regions);
      fitted.current = true;
    }
    const markers = L.layerGroup().addTo(map);
    for (const { id, name, latitude, longitude, count } of regions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = s.marker;
      button.textContent = format.format(count);
      button.dataset.membershipRegion = String(id);
      button.setAttribute("aria-label", `${name}, ${format.format(count)} ${statusLabel}`);
      const position: L.LatLngTuple = [latitude, longitude];
      L.DomEvent.disableClickPropagation(button);
      button.addEventListener("click", () => {
        setSelectedId(id);
        map.setView(position, Math.max(map.getZoom(), 14), { animate: false });
      });
      const label = document.createElement("span");
      label.textContent = name;
      L.marker(position, {
        icon: L.divIcon({ className: s.markerAnchor, html: button, iconSize: [44, 44] }),
        keyboard: false,
      }).bindTooltip(label, { direction: "top", offset: [0, -20] }).addTo(markers);
    }
    return () => { markers.remove(); };
  }, [map, regions, statusLabel]);

  useEffect(() => {
    viewport.current?.querySelectorAll<HTMLButtonElement>("[data-membership-region]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.membershipRegion === String(selected?.id)));
    });
  }, [map, regions, selected?.id]);

  async function toggleFullScreen() {
    if (document.fullscreenElement === frame.current) {
      await document.exitFullscreen();
    } else if (expanded) {
      setExpanded(false);
    } else if (frame.current?.requestFullscreen) {
      try { await frame.current.requestFullscreen(); }
      catch { setExpanded(true); }
    } else {
      setExpanded(true);
    }
  }

  const isExpanded = expanded || fullScreen;
  return <>
    <section className={s.map} ref={frame} data-expanded={expanded || undefined} aria-label="Mapa interativo da membresia">
      <div className={s.viewport} ref={viewport} />
      <div className={s.layers} role="group" aria-label="Camadas do mapa">
        <button type="button" aria-pressed={layer === "map"} onClick={() => setLayer("map")}><UIIcon name="map" size={16} /> Mapa</button>
        <button type="button" aria-pressed={layer === "satellite"} onClick={() => setLayer("satellite")}>Satélite</button>
      </div>
      <div className={s.tools} role="group" aria-label="Controles do mapa">
        <button type="button" aria-label="Aproximar" onClick={() => map?.zoomIn()}><UIIcon name="plus" size={18} /></button>
        <button type="button" aria-label="Afastar" onClick={() => map?.zoomOut()}><UIIcon name="minus" size={18} /></button>
        <button type="button" aria-label="Voltar à visão geral" onClick={() => { if (map) fitRegions(map, regions); }}><UIIcon name="target" size={18} /></button>
        <button type="button" aria-label={isExpanded ? "Restaurar tamanho do mapa" : "Expandir mapa"}
          aria-pressed={isExpanded} onClick={() => void toggleFullScreen()}><UIIcon name="expand" size={18} /></button>
      </div>
      {selected && <div className={s.detail} aria-live="polite">
        <span className={s.detailIcon}><UIIcon name="pin" size={18} /></span>
        <div><strong>{selected.name}</strong><span>{format.format(selected.count)} {statusLabel}</span></div>
        <button type="button" aria-label="Fechar detalhes da região"
          onClick={() => setSelectedId(null)}><UIIcon name="close" size={16} /></button>
      </div>}
      {tileIssue && <p role="status" className={s.tileIssue}>Exibindo os limites do DF enquanto a base carrega.</p>}
    </section>
    <div hidden ref={templeSymbol}><span><UIIcon name="church" size={18} /></span></div>
    <div className={s.legend}><span><i aria-hidden="true" /> Membros por região</span><span><UIIcon name="church" size={16} /> Templo ID Riacho 1</span></div>
    {regions.length === 0 && <p className={s.empty} role="status">Nenhuma região pode ser exibida para esta situação.</p>}
  </>;
}
