// Aggregate public ofProvider review ratings per listing -> publicData.avgRating/reviewCount.
// Also stamps publicData.proHost for proven operators (2+ published listings OR a
// linked Swimply calendar) — powers the "Pro Host" card badge.
// Integration API for listing read/write (merlin creds); Marketplace API (public token) for reviews.
const integ = 'https://flex-integ-api.sharetribe.com';
const mkt = 'https://flex-api.sharetribe.com';
const ikey = process.env.SHARETRIBE_CLI_API_KEY || process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_ID;
const isec = process.env.SHARETRIBE_CLI_API_SECRET || process.env.SHARETRIBE_INTEGRATION_SDK_CLIENT_SECRET;
const cid = process.env.MKT_CID;
const idOf = l => (l.id && l.id.uuid) ? l.id.uuid : l.id;

const run = async () => {
  const it = await fetch(integ + '/v1/auth/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({grant_type:'client_credentials',client_id:ikey,client_secret:isec,scope:'integ'}) }).then(r=>r.json());
  const iauth = { Authorization: 'Bearer ' + it.access_token };
  let page=1, listings=[], more=true;
  while (more) {
    const r = await fetch(integ + '/v1/integration_api/listings/query?states=published&perPage=100&page=' + page + '&include=author', { headers: iauth }).then(r=>r.json());
    listings = listings.concat(r.data || []);
    more = r.meta && r.meta.totalPages && page < r.meta.totalPages; page++;
    if (page > 20) break;
  }
  // Pro Host: count published listings per author.
  const authorCount = {};
  for (const l of listings) {
    const rawAid = l.relationships?.author?.data?.id;
    const aid = typeof rawAid === 'string' ? rawAid : rawAid?.uuid;
    if (aid) authorCount[aid] = (authorCount[aid] || 0) + 1;
  }
  const mt = await fetch(mkt + '/v1/auth/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:cid,grant_type:'client_credentials',scope:'public-read'}) }).then(r=>r.json());
  const mauth = { Authorization: 'Bearer ' + mt.access_token };
  let updated=0, unchanged=0;
  for (const l of listings) {
    const lid = idOf(l);
    const pd = l.attributes.publicData || {};
    let revs = [];
    try {
      const rj = await fetch(mkt + '/v1/api/reviews/query?listingId=' + lid + '&state=public&perPage=100', { headers: mauth }).then(r=>r.json());
      revs = (rj.data || []).filter(x => x.attributes && x.attributes.type === 'ofProvider' && typeof x.attributes.rating === 'number');
    } catch (e) { /* reviews unreadable: still allow proHost stamping */ }
    const newPd = {};
    const count = revs.length;
    if (count > 0) {
      const avg = Math.round((revs.reduce((s,x)=>s+x.attributes.rating,0)/count) * 10) / 10;
      if (pd.avgRating !== avg || pd.reviewCount !== count) { newPd.avgRating = avg; newPd.reviewCount = count; }
    }
    const rawAid2 = l.relationships?.author?.data?.id;
    const aid = typeof rawAid2 === 'string' ? rawAid2 : rawAid2?.uuid;
    const pro = (aid && authorCount[aid] > 1) || !!pd.swimplyIcalUrl;
    if ((pd.proHost === true) !== pro) newPd.proHost = pro;
    if (!Object.keys(newPd).length) { unchanged++; continue; }
    const up = await fetch(integ + '/v1/integration_api/listings/update', { method:'POST', headers:{...iauth,'Content-Type':'application/json'}, body: JSON.stringify({ id: lid, publicData: newPd }) });
    if (up.ok) { updated++; console.log('updated', (l.attributes.title||'').slice(0,40), '=>', JSON.stringify(newPd)); }
    else { console.log('FAIL', lid, up.status, (await up.text()).slice(0,160)); }
  }
  console.log('RATINGS DONE listings='+listings.length+' updated='+updated+' unchanged='+unchanged);
};
run().catch(e => { console.log('FATAL', e.message); process.exit(1); });
