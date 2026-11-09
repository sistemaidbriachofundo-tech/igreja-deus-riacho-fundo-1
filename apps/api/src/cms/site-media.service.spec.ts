import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { put, list } from "@vercel/blob";
import { SiteMediaService } from "./site-media.service";
import type { AuthUser } from "../auth/types/auth-user";

jest.mock("@vercel/blob",()=>({ put:jest.fn(),list:jest.fn() }));
const editor:AuthUser={
  userId:"media1",personId:"person1",email:"editor@example.test",
  grants:[{roleCode:"EDITOR_SITE",organizationId:"org",churchId:"church"}],
};
const member:AuthUser={...editor,userId:"u2",grants:[{roleCode:"MEMBRO",organizationId:"org",churchId:"church"}]};
const pilot={organizationId:"org",churchId:"church"};
function create(){
  const prisma={auditLog:{create:jest.fn().mockResolvedValue({})}};
  const service=new SiteMediaService({getPilotChurch:jest.fn().mockResolvedValue(pilot)} as never,prisma as never);
  return {service,prisma};
}
function png():Express.Multer.File{
  const bytes=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(40)]);
  return {buffer:bytes,size:bytes.length,mimetype:"image/png",originalname:"Culto.png"} as Express.Multer.File;
}
describe("SiteMediaService",()=>{
  const previous=process.env.BLOB_READ_WRITE_TOKEN;
  const previousStorage=process.env.SITE_MEDIA_STORAGE;
  const previousRoot=process.env.SITE_MEDIA_LOCAL_ROOT;
  afterEach(()=>{
    if(previous===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN=previous;
    if(previousStorage===undefined)delete process.env.SITE_MEDIA_STORAGE;
    else process.env.SITE_MEDIA_STORAGE=previousStorage;
    if(previousRoot===undefined)delete process.env.SITE_MEDIA_LOCAL_ROOT;
    else process.env.SITE_MEDIA_LOCAL_ROOT=previousRoot;
    jest.clearAllMocks();
  });
  it("rejects members before accessing the store",async()=>{
    const {service}=create();
    await expect(service.list(member)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.upload(member,png())).rejects.toBeInstanceOf(ForbiddenException);
    expect(list).not.toHaveBeenCalled();
  });
  it("reports missing object storage without exposing secrets",async()=>{
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const {service}=create();
    const result=await service.list(editor);
    expect(result.configured).toBe(false);
    expect(result.assets).toEqual([]);
    await expect(service.upload(editor,png())).rejects.toThrow("armazenamento");
  });
  it("rejects misleading MIME types, scripts and oversized images",async()=>{
    process.env.BLOB_READ_WRITE_TOKEN="test-token";
    const {service}=create();
    await expect(service.upload(editor,{...png(),buffer:Buffer.from("<script>bad</script>")} as Express.Multer.File)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(editor,{...png(),size:4*1024*1024} as Express.Multer.File)).rejects.toBeInstanceOf(BadRequestException);
    expect(put).not.toHaveBeenCalled();
  });
  it("stores approved images under church scope and audits metadata",async()=>{
    process.env.BLOB_READ_WRITE_TOKEN="test-token";
    jest.mocked(put).mockResolvedValue({
      pathname:"church/church/site/abc-culto.png",
      url:"https://store.public.blob.vercel-storage.com/church/church/site/abc-culto.png",
      downloadUrl:"https://store.public.blob.vercel-storage.com/church/church/site/abc-culto.png?download=1",
      contentType:"image/png",contentDisposition:"inline",
    } as never);
    const {service,prisma}=create();
    const result=await service.upload(editor,png());
    expect(result.asset.url).toMatch(/^https:/);
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/^church\/church\/site\//),expect.any(Buffer),expect.objectContaining({access:"public",token:"test-token",contentType:"image/png"}));
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it("returns only media within church prefix",async()=>{
    process.env.BLOB_READ_WRITE_TOKEN="test-token";
    jest.mocked(list).mockResolvedValue({blobs:[],hasMore:false,cursor:undefined} as never);
    const {service}=create();
    const result=await service.list(editor);
    expect(result.configured).toBe(true);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({prefix:"church/church/site/"}));
  });
  it("stores a validated photo on allowed local storage and refuses traversal",async()=>{
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const root=await mkdtemp(path.join(tmpdir(),"site-media-"));
    process.env.SITE_MEDIA_STORAGE="local";
    process.env.SITE_MEDIA_LOCAL_ROOT=root;
    const {service,prisma}=create();
    const result=await service.upload(editor,png());
    expect(result.storage).toBe("local");
    expect(result.asset.url).toMatch(/^\/cms\/site-media\/files\/church\/[0-9a-f-]{36}-culto\.png$/);
    expect(result.asset.url).not.toMatch(/\/images\//);
    const listed=await service.list(editor);
    expect(listed.assets.map(asset=>asset.url)).toContain(result.asset.url);
    const name=result.asset.url.split("/").pop()??"";
    const file=await service.readPublic("church",name);
    expect(file.mime).toBe("image/png");
    const onDisk=await readFile(path.join(root,"church",name));
    expect(onDisk.equals(file.bytes)).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({action:"site.media.upload",metadata:{mimeType:"image/png",byteSize:file.bytes.length}}),
    }));
    await expect(service.readPublic("../church",name)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.readPublic("church","../"+name)).rejects.toBeInstanceOf(NotFoundException);
    await rm(root,{recursive:true,force:true});
  });
});
