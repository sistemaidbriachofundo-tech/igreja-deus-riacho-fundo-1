import { describe, expect, it, vi } from "vitest";
import {
  parsePublishedEvent, parsePublishedEvents, parsePublishedHome,
  parsePublishedMinistryDetail, parsePublishedNews, currentPublishedEvents,
  formatPortalDate, publicApiBase, fetchPublished,
} from "./portal-live-data";

const event = {
  id:"evt1", slug:"culto-da-familia", name:"Encontro da comunidade",
  startsAt:"2026-12-03T22:00:00.000Z", endsAt:null,
  ministryId:null, locationText:"Igreja", featuredOnHome:true,
};
const news = {
  id:"cms1",slug:"uma-noticia",title:"Nossa comunidade",kind:"NEWS",
  status:"PUBLICADO",summary:"Uma história",body:"Texto simples",imageUrl:null,
};
describe("public content safety and API contract", () => {
  it("rejects invalid and unpublished-looking payloads; never renders arbitrary HTML", () => {
    expect(parsePublishedEvent({ ...event, startsAt:"not a date" })).toBeNull();
    expect(parsePublishedEvent({ ...event, name:"" })).toBeNull();
    expect(parsePublishedNews({ ...news, kind:"MEMBERSHIP" })).toBeNull();
    expect(parsePublishedNews({ ...news, imageUrl:"javascript:alert(1)" })?.imageUrl).toBeNull();
    expect(parsePublishedEvents({ events:[event,{ id:"bad" }] })).toHaveLength(1);
    expect(parsePublishedEvents({ members:[] })).toBeNull();
  });

  it("keeps the published home and ministry projection separate from private records", () => {
    const home = parsePublishedHome({
      church:{ name:"Igreja de Deus",slug:"riacho-fundo" },
      featuredEvents:[event],contentBlocks:[news],banners:[],
      ministries:[{ id:"m1",slug:"jovens",name:"Jovens" }],
      pastoralNotes:["SECRET"],memberPhones:["PRIVATE"],
    });
    expect(home?.featuredEvents).toHaveLength(1);
    expect(home?.contentBlocks).toHaveLength(1);
    expect(JSON.stringify(home)).not.toContain("SECRET");
    expect(JSON.stringify(home)).not.toContain("PRIVATE");
    const ministry = parsePublishedMinistryDetail({
      id:"m1",slug:"jovens",name:"Jovens",
      leadership:[{ displayName:"Pessoa publicada",roleTitle:"Liderança" },{ phone:"private" }],
      relatedEvents:[event], relatedContent:[news],
      galleryUrls:["https://example.com/a.jpg","http://insecure.test/image"],
    });
    expect(ministry?.leadership).toEqual([{ displayName:"Pessoa publicada",roleTitle:"Liderança" }]);
    expect(ministry?.galleryUrls).toEqual(["https://example.com/a.jpg"]);
  });

  it("shows future published events in Brasília time without changing backend timestamps", () => {
    const events = [
      { ...event, id:"past", startsAt:"2026-01-01T22:00:00.000Z" },
      { ...event, id:"future", startsAt:"2026-12-03T22:00:00.000Z" },
    ];
    expect(currentPublishedEvents(events.flatMap(row => {
      const parsed=parsePublishedEvent(row); return parsed?[parsed]:[];
    }),Date.parse("2026-11-06T12:00:00Z")).map(row=>row.id)).toEqual(["future"]);
    expect(formatPortalDate("2026-12-03T22:00:00Z").dayAndTime).toContain("19:00");
  });

  it("allows HTTPS or local developer API, and blocks insecure remote services", () => {
    expect(publicApiBase("https://hml.example.org/api/")).toBe("https://hml.example.org/api");
    expect(publicApiBase("http://localhost:3001")).toBe("http://localhost:3001");
    expect(publicApiBase("http://public.example.org")).toBeNull();
    expect(publicApiBase("javascript:alert(1)")).toBeNull();
    expect(publicApiBase(undefined)).toBeNull();
  });

  it("fails safely without a configured public endpoint", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    await expect(fetchPublished("/public/home",parsePublishedHome,{apiUrl:""}))
      .rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    request.mockRestore();
  });
});
