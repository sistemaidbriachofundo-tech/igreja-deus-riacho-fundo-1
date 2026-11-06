import { BadRequestException,ForbiddenException } from "@nestjs/common";
import { detectSiteImage,SiteMediaService } from "./site-media.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("SiteMediaService",()=>{
  it("accepts only magic bytes from JPEG, PNG, WebP",()=>{
    expect(detectSiteImage(Buffer.from([255,216,255,225,0,0,0,0,0,0,0,0]))?.mime).toBe("image/jpeg");
    expect(detectSiteImage(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]))?.mime).toBe("image/png");
    expect(detectSiteImage(Buffer.from("RIFF0000WEBP","ascii"))?.mime).toBe("image/webp");
    expect(detectSiteImage(Buffer.from("<svg><script>","ascii"))).toBeNull();
    expect(detectSiteImage(Buffer.from("malware content","ascii"))).toBeNull();
  });
  it("blocks non-editors before checking storage or media",async()=>{
    const service=new SiteMediaService({getPilotChurch:jest.fn().mockResolvedValue({organizationId:"org1",churchId:"rf1"})} as never,{} as never);
    const actor:AuthUser={userId:"u1",personId:"p1",email:"u@example.test",grants:[{roleCode:"MEMBRO",organizationId:"org1",churchId:"rf1"}]};
    await expect(service.upload(actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.gallery(actor)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("requires valid file and storage for authorized staff",async()=>{
    const service=new SiteMediaService({getPilotChurch:jest.fn().mockResolvedValue({organizationId:"org1",churchId:"rf1"})} as never,{} as never);
    const actor:AuthUser={userId:"u1",personId:"p1",email:"u@example.test",grants:[{roleCode:"SITE_EDITOR",organizationId:"org1",churchId:"rf1"}]};
    const previous=process.env.BLOB_READ_WRITE_TOKEN;
    try{
      process.env.BLOB_READ_WRITE_TOKEN="synthetic-test-token";
      await expect(service.upload(actor)).rejects.toBeInstanceOf(BadRequestException);
    }finally{
      if(previous===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=previous;
    }
  });
});
