// removed
const qdrantService = require('./backend/services/qdrantService');
const searchService = require('./backend/services/searchService');

async function patchDB() {
  await qdrantService.init();

  let offset = null;
  const allPoints = [];

  try {
    do {
      const response = await qdrantService.client.scroll('media_brain', {
        limit: 100,
        offset: offset,
        with_payload: true,
        with_vector: false
      });
      allPoints.push(...response.points);
      offset = response.next_page_offset;
    } while (offset);

    console.log(`Loaded ${allPoints.length} points from Qdrant.`);

    let patchedCount = 0;

    for (const p of allPoints) {
      const payload = p.payload;
      const title = payload.title;
      const media_type = payload.media_type;

      // Check if it needs patching
      const needsYearPatch = !payload.release_year || payload.release_year === 'Unknown';
      const isVNPlatformBug = media_type === 'visual novel' && payload.genres && payload.genres.some(g => g === 'win' || g === 'ps4');
      const needsGenrePatch = !payload.genres || payload.genres.length === 0 || isVNPlatformBug;

      if (needsYearPatch || needsGenrePatch) {
        console.log(`Patching [${title}] (${media_type}). Year: ${payload.release_year}, Genres: ${payload.genres}`);
        try {
          const structuredMeta = await searchService.fetchMetadataForCandidate(title, media_type);
          if (structuredMeta) {
            const newPayload = {};
            if (structuredMeta.release_year) newPayload.release_year = structuredMeta.release_year;
            if (structuredMeta.genres && structuredMeta.genres.length > 0) newPayload.genres = structuredMeta.genres;
            if (structuredMeta.tags && structuredMeta.tags.length > 0) newPayload.tags = structuredMeta.tags;
            if (structuredMeta.studio) newPayload.studio = structuredMeta.studio;

            await qdrantService.client.setPayload('media_brain', {
              payload: newPayload,
              points: [p.id]
            });
            console.log(`  -> Patched ${title}: Year=${newPayload.release_year}, Genres=${newPayload.genres}`);
            patchedCount++;
          } else {
            console.log(`  -> No metadata found to patch ${title}`);
          }
        } catch (err) {
          console.error(`  -> Error patching ${title}:`, err.message);
        }
      }
    }

    console.log(`\nPatch complete. Successfully patched ${patchedCount} items.`);

  } catch (e) {
    console.error('Error in patch script:', e.message);
  }
}

patchDB();
