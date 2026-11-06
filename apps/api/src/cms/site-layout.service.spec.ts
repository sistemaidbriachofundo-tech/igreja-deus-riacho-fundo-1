import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { DEFAULT_SITE_LAYOUT, parseSiteLayout, SiteLayoutService } from "./site-layout.service";

const pilot = { organizationId:"org1",churchId:"church1" };
const secretaria:AuthUser = {
  userId:"u1",personId:"p1",email:"editor@example.test",
  grants:[{roleCode:"SECRETARIA",organizationId:"org1",churchId:"church1"}],
};
const membro:AuthUser = {
  userId:"u2",personId:"p2",email:"membro@example.test",
  grants:[{roleCode:"MEMBRO",organizationId:"org1",churchId:"church1"}],
};
function service(prisma:unknown){
  return new SiteLayoutService(prisma as never, {getPilotChurch:jest.fn().mockResolvedValue(pilot)} as never);
}
const draftRow = {
  id:"draft1",organizationId:"org1",churchId:"church1",slug:"idriacho-home-editor-draft",
  body:JSON.stringify(DEFAULT_SITE_LAYOUT),updatedAt:new Date("2026-11-06T12:00:00Z"),
};

describe("SiteLayoutService",()=>{
  it("allows only safe palettes, HTTPS or approved media and unique sections",()=>{
    expect(parseSiteLayout(DEFAULT_SITE_LAYOUT)).toEqual(DEFAULT_SITE_LAYOUT);
    expect(()=>parseSiteLayout({...DEFAULT_SITE_LAYOUT,appearance:"background:url(javascript:alert(1))"})).toThrow(BadRequestException);
    expect(()=>parseSiteLayout({...DEFAULT_SITE_LAYOUT,hidden:["convite"]})).toThrow(BadRequestException);
    expect(()=>parseSiteLayout({...DEFAULT_SITE_LAYOUT,sections:["essencia","essencia"]})).toThrow(BadRequestException);
    expect(()=>parseSiteLayout({...DEFAULT_SITE_LAYOUT,hero:{...DEFAULT_SITE_LAYOUT.hero,imageUrl:"javascript:alert(1)"}})).toThrow(BadRequestException);
    expect(()=>parseSiteLayout({...DEFAULT_SITE_LAYOUT,hero:{...DEFAULT_SITE_LAYOUT.hero,imageUrl:"http://imagem-insegura.test/foto.jpg"}})).toThrow(BadRequestException);
  });

  it("blocks unauthorized editorial account before reading database",async()=>{
    const findMany=jest.fn();
    await expect(service({cmsContent:{findMany}}).editor(membro)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("editor returns default draft and no published version without records",async()=>{
    const prisma={cmsContent:{findMany:jest.fn().mockResolvedValue([])}};
    const result=await service(prisma).editor(secretaria);
    expect(result.draft).toEqual(DEFAULT_SITE_LAYOUT);
    expect(result.published).toBeNull();
  });

  it("draft saves a revision without updating published row",async()=>{
    const operations={
      cmsContent:{upsert:jest.fn().mockResolvedValue(draftRow)},
      cmsContentRevision:{create:jest.fn().mockResolvedValue({})},
      auditLog:{create:jest.fn().mockResolvedValue({})},
    };
    const prisma={
      cmsContent:{findUnique:jest.fn().mockResolvedValue(null)},
      $transaction:jest.fn(async(fn:(value:typeof operations)=>Promise<unknown>)=>fn(operations)),
    };
    const result=await service(prisma).saveDraft(secretaria,DEFAULT_SITE_LAYOUT,null);
    expect(result.draft.hero.title).toBe(DEFAULT_SITE_LAYOUT.hero.title);
    expect(operations.cmsContent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:{churchId_slug:{churchId:"church1",slug:"idriacho-home-editor-draft"}},
    }));
    expect(operations.cmsContentRevision.create).toHaveBeenCalled();
    expect(operations.auditLog.create).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("publishes only the saved draft and logs public revision",async()=>{
    const row={...draftRow,id:"live1",slug:"idriacho-home-editor-live",publishedAt:new Date("2026-11-06T12:30:00Z")};
    const operations={
      cmsContent:{upsert:jest.fn().mockResolvedValue(row)},
      cmsContentRevision:{create:jest.fn()},
      auditLog:{create:jest.fn()},
    };
    const prisma={
      cmsContent:{findUnique:jest.fn().mockResolvedValue(draftRow)},
      $transaction:jest.fn(async(fn:(value:typeof operations)=>Promise<unknown>)=>fn(operations)),
    };
    const result=await service(prisma).publish(secretaria,draftRow.updatedAt.toISOString());
    expect(result.published).toEqual(DEFAULT_SITE_LAYOUT);
    expect(operations.cmsContent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:{churchId_slug:{churchId:"church1",slug:"idriacho-home-editor-live"}},
    }));
    expect(operations.cmsContentRevision.create).toHaveBeenCalled();
  });

  it("public route never exposes draft",async()=>{
    const findFirst=jest.fn().mockResolvedValue(null);
    const result=await service({cmsContent:{findFirst}}).published();
    expect(result.layout).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({slug:"idriacho-home-editor-live",status:"PUBLICADO"}),
    }));
  });
});
