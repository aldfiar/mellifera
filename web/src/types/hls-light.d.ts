// SPDX-License-Identifier: Apache-2.0

// Ambient typing for the hls.js LIGHT build (packaged-playback D-12): the
// artifacts are already fMP4, so the full build's alt-audio/EME/subtitle
// machinery is dead weight — the light dist keeps the bundle down. The
// subpath ships no .d.ts of its own; the API is exactly the main entry's.
declare module "hls.js/light" {
  import Hls from "hls.js";
  export default Hls;
}
