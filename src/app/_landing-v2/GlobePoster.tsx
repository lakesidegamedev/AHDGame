/**
 * Static stand-in for the interactive landing globe, sized by its parent box
 * so swapping the live globe in never moves anything. Server-rendered.
 */
export function GlobePoster({ base, hidden }: { base: string; hidden: boolean }) {
  const sizes = "130vmax";
  return (
    <picture
      className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
        hidden ? "opacity-0" : "opacity-100"
      }`}
    >
      <source
        type="image/avif"
        srcSet={`${base}-640.avif 640w, ${base}-1200.avif 1200w`}
        sizes={sizes}
      />
      <source
        type="image/webp"
        srcSet={`${base}-640.webp 640w, ${base}-1200.webp 1200w`}
        sizes={sizes}
      />
      <img
        src={`${base}-1200.webp`}
        alt=""
        width={1200}
        height={1200}
        decoding="async"
        className="h-full w-full object-cover"
      />
    </picture>
  );
}
