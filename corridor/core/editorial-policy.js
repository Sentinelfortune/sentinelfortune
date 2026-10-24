/* Seven-world editorial charter v1. This is one policy within the existing Corridor.
 * Automated topical cues are deliberately conservative; uncertain work requires
 * Owner review and must not be silently rerouted. */
export const EDITORIAL_POLICY_VERSION = "sfl-seven-worlds/1.0.0";
export const EDITORIAL_CHARTERS = Object.freeze({
  SENTINEL_FORTUNE_RECORDS: { identity:"sentinelfortunerecords", purpose:"Music releases, artist education, music rights, royalties, publishing, artist strategy and SFL LEGIT literacy", voice:"professional, educational, creator-first", audience:"independent artists, labels, producers and music rights holders", excluded:"general spiritual sermons, unrelated business classes, generic software tutorials", commercial:"House of Assets products only through approved Shop links" },
  CODEX_WORLD_TV: { identity:"codexworldtv", purpose:"Original audiovisual storytelling, episodes, documentaries, narrative universes and animation", voice:"cinematic, narrative, imaginative", audience:"viewers and storytellers", excluded:"unrelated legal guides or spiritual classes", commercial:"media assets governed separately" },
  LUMEN_GAME: { identity:"lumengame", purpose:"Games, interactive challenges, play, game design and experiential discovery", voice:"playful, participatory, accessible", audience:"players and learners", excluded:"non-interactive sermons or generic product catalogues", commercial:"no checkout inside editorial" },
  LUMEN_SCHOOL_ACADEMY: { identity:"lumenschoolacademy", purpose:"Structured education in entrepreneurship, business, finance, law, leadership and professional skills", voice:"pedagogical, practical, structured", audience:"learners, founders and professionals", excluded:"standalone worship reflections or entertainment releases", commercial:"separate premium classes and governed offers" },
  VIBRAFLOW_MEDIA: { identity:"vibraflowmedia", purpose:"Contemplation, inner growth, wisdom, spirituality, meditations, teachings and rhapsodies", voice:"reflective, profound, humane", audience:"readers and listeners seeking reflection", excluded:"music royalty guides and generic developer documentation", commercial:"free editorial distinct from premium experiences" },
  LIGHTNODE_SYSTEMS: { identity:"lightnodesystems", purpose:"AI, software, systems architecture, cybersecurity, automation and technical responsibility", voice:"precise, technical, practical", audience:"builders and technical decision-makers", excluded:"spiritual sermons, unrelated music distribution lessons", commercial:"no service checkout in editorial" },
  OG_LEGACY_STORE: { identity:"oglegacystore", purpose:"Curated product stories, digital assets, licensed collections and governed commercial catalogues", voice:"clear, premium, product-focused", audience:"buyers of digital assets", excluded:"general teaching presented as purchasable inventory", commercial:"prices and payment are always controlled outside the editorial Corridor" }
});
const anchors = Object.freeze({
  SENTINEL_FORTUNE_RECORDS:[/\b(music|musical|musique|artistes?|artists?|royalt(?:y|ies)|masters?|recording|enregistrement|songwriters?|compos(?:ition|er)|phonogram|licensing|sync|discograph|streaming)\b/i],
  CODEX_WORLD_TV:[/\b(storytell|cinematic|documentar|film|screenplay|episodes?|r[eé]cit|animation)\b/i],
  LUMEN_GAME:[/\b(games?|gaming|playable|gamification|jeux|joueurs?|levels?|challenges?|interactive)\b/i],
  LUMEN_SCHOOL_ACADEMY:[/\b(entrepreneur|business|finance|leadership|founders?|school|education|curriculum|entreprise|cours|masterclass)\b/i],
  VIBRAFLOW_MEDIA:[/\b(spiritual|meditat|contemplat|prayer|pri[eè]re|divine|christ|father|p[eè]re|faith|foi|gr[aâ]ce|rhapsod|wisdom|sagesse)\b/i],
  LIGHTNODE_SYSTEMS:[/\b(software|cybersecurity|developers?|codebase|API|technical|architecture|automati[sz]|logiciel|syst[eè]mes?|cloud|AI|intelligence artificielle)\b/i],
  OG_LEGACY_STORE:[/\b(collection|catalog|boutique|store|products?|licences?|digital assets|produits? num[eé]riques?)\b/i]
});
export function checkEditorialFit(record) {
  const selected=EDITORIAL_CHARTERS[record?.branch];
  if(!selected) return {ok:false,code:"UNKNOWN_EDITORIAL_WORLD",policy:EDITORIAL_POLICY_VERSION};
  const text=[record.title,record.summary,record.body].filter(Boolean).join(" ").slice(0,30000);
  const hits=Object.keys(anchors).filter(k=>anchors[k].some(re=>re.test(text)));
  // Domain boundaries are explicit. Multi-topic content is not automatically
  // reclassified; Owner must review and approve its precise destination.
  const cross=hits.filter(x=>x!==record.branch);
  if(hits.length===1 && cross.length===1) return {ok:false,code:"EDITORIAL_WORLD_MISMATCH",policy:EDITORIAL_POLICY_VERSION,observed:cross[0],declared:record.branch,reason:"Content signals a different world. Rewrite for the declared audience or submit a distinct record to the proper world."};
  return {ok:true,policy:EDITORIAL_POLICY_VERSION,reviewRequired:hits.length===0||cross.length>0,signals:hits,identity:selected.identity};
}
