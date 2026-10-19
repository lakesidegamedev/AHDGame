/**
 * /corporations resolves the viewer's country and redirects to `/stockmarket/global`.
 * This covers the round-trip before that redirect resolves.
 *
 * Kept deliberately plain: a detailed layout here would flash and then be
 * replaced by a different page, which reads as loading twice. The destination
 * wants its own `loading.tsx` for the render that actually takes time.
 */
export { RedirectLoading as default } from "@/components/ui/RedirectLoading";
