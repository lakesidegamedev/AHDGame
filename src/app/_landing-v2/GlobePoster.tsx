/**
 * Static stand-in for the interactive landing globe, sized by its parent box
 * so swapping the live globe in never moves anything. Server-rendered.
 */
export function GlobePoster({ base, hidden }: { base: string; hidden: boolean }) {
  return (
    <picture
      className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
        hidden ? "opacity-0" : "opacity-100"
      }`}
    >
      <source type="image/avif" srcSet={`${base}-960.avif`} />
      <img
        src={`${base}-960.webp`}
        alt=""
        width={960}
        height={960}
        decoding="async"
        className="h-full w-full object-cover"
      />
    </picture>
  );
}
