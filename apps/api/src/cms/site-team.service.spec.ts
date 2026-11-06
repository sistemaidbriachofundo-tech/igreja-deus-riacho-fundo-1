import { ForbiddenException,NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { SiteTeamService } from "./site-team.service";

const pilot={organizationId:"org1",churchId:"rf1"};
const admin:AuthUser={userId:"admin1",personId:"p1",email:"admin@example.test",grants:[{roleCode:"PLATFORM_ADMIN",organizationId:"org1",churchId:"rf1"}]};
const member:AuthUser={userId:"member1",personId:"p2",email:"member@example.test",grants:[{roleCode:"MEMBRO",organizationId:"org1",churchId:"rf1"}]};

describe("SiteTeamService",()=>{
  it("only allows platform admin to assign role",async()=>{
    const tx={grant:{findFirst:jest.fn(),create:jest.fn()},auditLog:{create:jest.fn()}};
    const prisma={user:{findUnique:jest.fn()},role:{findUnique:jest.fn()},$transaction:jest.fn(async (f:(ctx:typeof tx)=>Promise<unknown>)=>f(tx))};
    const service=new SiteTeamService(prisma as never,{getPilotChurch:jest.fn().mockResolvedValue(pilot)} as never);
    await expect(service.grant(member,"person@example.test","SITE_EDITOR")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it("assigns only editor or publisher role to existing active user in pilot",async()=>{
    const tx={grant:{findFirst:jest.fn().mockResolvedValue(null),create:jest.fn().mockResolvedValue({id:"grant1"})},auditLog:{create:jest.fn()}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:"user2",status:"ACTIVE"})},role:{findUnique:jest.fn().mockResolvedValue({id:"role2"})},$transaction:jest.fn(async (f:(ctx:typeof tx)=>Promise<unknown>)=>f(tx))};
    const service=new SiteTeamService(prisma as never,{getPilotChurch:jest.fn().mockResolvedValue(pilot)} as never);
    const result=await service.grant(admin,"  EDITOR@example.test  ","SITE_EDITOR");
    expect(result).toEqual({id:"grant1",role:"SITE_EDITOR",userId:"user2"});
    expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{email:"editor@example.test"},select:{id:true,status:true}});
    expect(tx.grant.create).toHaveBeenCalledWith({data:expect.objectContaining({organizationId:"org1",churchId:"rf1",ministryId:null})});
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
  it("fails without an existing account and doesn't create a user",async()=>{
    const prisma={user:{findUnique:jest.fn().mockResolvedValue(null)}};
    const service=new SiteTeamService(prisma as never,{getPilotChurch:jest.fn().mockResolvedValue(pilot)} as never);
    await expect(service.grant(admin,"absent@example.test","SITE_EDITOR")).rejects.toBeInstanceOf(NotFoundException);
  });
});
