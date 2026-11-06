import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PilotModule } from "../pilot/pilot.module";
import { ChannelRateLimitService } from "./channel-rate-limit.service";
import { ChannelsController } from "./channels.controller";
import { ChannelsService } from "./channels.service";

@Module({
  imports: [AuthModule, PilotModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChannelRateLimitService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
