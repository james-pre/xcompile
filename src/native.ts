import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const requireAddon = createRequire(resolve(import.meta.dirname));
export default requireAddon('../build/Release/xcompile-native');
