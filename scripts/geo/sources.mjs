// Try source candidates in order, preserving each candidate's mapping metadata.
export async function fetchSource(sources) {
  for (const s of sources) {
    try {
      let url = s.url;
      if (s.indirect) {
        const meta = await (await fetch(url)).json();
        url = meta?.gjDownloadURL;
        if (!url) throw new Error("no gjDownloadURL");
      }
      const gj = await (await fetch(url)).json();
      if (gj?.features?.length) return { ...s, gj };
      throw new Error("no features");
    } catch (e) {
      console.warn(`source ${s.name} failed: ${e.message}`);
    }
  }
  throw new Error("all sources failed");
}
