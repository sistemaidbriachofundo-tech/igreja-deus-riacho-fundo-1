import { Global, Module } from "@nestjs/common";
import { PrivateStorageService } from "./private-storage.service";

@Global()
@Module({
  providers: [PrivateStorageService],
  exports: [PrivateStorageService],
})
export class StorageModule {}
