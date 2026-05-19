#!/usr/bin/env node
/**
 * Build-time fetch of Google Reviews via the Places API.
 * Runs on Netlify before each deploy; writes reviews.json which the
 * frontend reads at runtime (same-origin, no CORS).
 *
 * Env vars:
 *   GOOGLE_PLACES_API_KEY  (required) — restricted to Places API
 *   GOOGLE_PLACE_ID        (optional) — bypass the Find Place lookup
 *   GOOGLE_PLACES_QUERY    (optional) — defaults to "Suki systems"
 *
 * Failure mode: logs and exits 0, leaving any existing reviews.json
 * untouched so the build still ships the previous good data.
 */

const fs = require('fs');
const path = require('path');

const KEY = process.env.GOOGLE_PLACES_API_KEY;
const QUERY = process.env.GOOGLE_PLACES_QUERY || 'Suki systems';
let PLACE_ID = process.env.GOOGLE_PLACE_ID;

const OUT_PATH = path.join(__dirname, '..', 'reviews.json');

async function findPlaceId() {
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(QUERY)}&inputtype=textquery&fields=place_id,name&key=${KEY}`;
  const res = await fetch(url).then(r => r.json());
  if (res.status !== 'OK' || !res.candidates?.length) {
    throw new Error(`Find Place failed: ${res.status} ${res.error_message || ''}`);
  }
  console.log(`Found Place ID for "${res.candidates[0].name}": ${res.candidates[0].place_id}`);
  return res.candidates[0].place_id;
}

async function fetchDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews,url&reviews_sort=newest&key=${KEY}`;
  const res = await fetch(url).then(r => r.json());
  if (res.status !== 'OK') {
    throw new Error(`Place Details failed: ${res.status} ${res.error_message || ''}`);
  }
  return res.result || {};
}

async function main() {
  if (!KEY) {
    console.warn('GOOGLE_PLACES_API_KEY not set — leaving existing reviews.json in place.');
    return;
  }

  try {
    if (!PLACE_ID) PLACE_ID = await findPlaceId();
    const result = await fetchDetails(PLACE_ID);
    const payload = {
      fetched_at: new Date().toISOString(),
      place_id: PLACE_ID,
      name: result.name,
      rating: result.rating,
      total: result.user_ratings_total,
      url: result.url,
      reviews: (result.reviews || []).map(r => ({
        author_name: r.author_name,
        profile_photo_url: r.profile_photo_url,
        rating: r.rating,
        relative_time_description: r.relative_time_description,
        text: r.text,
        time: r.time,
      })),
    };
    fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
    console.log(`Wrote reviews.json — ${payload.reviews.length} reviews, ${payload.rating}★ (${payload.total} total)`);
  } catch (err) {
    console.error('Review fetch failed:', err.message);
    if (!fs.existsSync(OUT_PATH)) {
      fs.writeFileSync(OUT_PATH, JSON.stringify({ reviews: [], error: err.message }, null, 2));
    }
  }
}

main();
