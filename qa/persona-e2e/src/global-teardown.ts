import { writeMatrixFiles } from "./journal.ts";

export default function globalTeardown(): void {
  writeMatrixFiles();
}
