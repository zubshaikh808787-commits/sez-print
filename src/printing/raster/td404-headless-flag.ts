/**
 * Legacy dev override — production TD-404 print auto-routes eligible labels through
 * headless Skia mono (`canHeadlessRasterPrint`) without this flag.
 * Keep false; set true only to force the old dev-only gate during local experiments.
 */
export const TD404_HEADLESS_SKIA_PRINT = false;
