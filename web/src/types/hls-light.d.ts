// SPDX-License-Identifier: Apache-2.0

// SPDX witness shim — witness-only since fix-hls-light-audio. Production
// code imports the FULL build ("hls.js": the light dist's missing
// audio-track controller played rendition packs silent); the light
// specifier survives only as the repro test's light-witness
// (PlayerHlsBuild.test.tsx pins the dist differential), whose import and
// importActual type through this declaration. The subpath ships no .d.ts
// of its own; the API is exactly the main entry's. Removing this file
// breaks `tsc --noEmit` on that test — keep it while the witness stands.
declare module "hls.js/light" {
  import Hls from "hls.js";
  export default Hls;
}
