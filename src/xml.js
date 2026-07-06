const fs = require('fs');
const crypto = require('crypto');

// The base's meta.xml / app.xml are machine-generated with a fixed shape, so
// targeted tag replacement keeps the files byte-identical outside the edits
// (matching what UWUVCI's XmlDocument round-trip effectively does).
function setTag(xml, tag, value) {
  const re = new RegExp(`(<${tag}(?:\\s[^>]*)?>)[\\s\\S]*?(</${tag}>)`);
  if (!re.test(xml)) return xml;
  return xml.replace(re, `$1${escapeXml(value)}$2`);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const LANGS = ['ja', 'en', 'fr', 'de', 'it', 'es', 'zhs', 'ko', 'nl', 'pt', 'ru', 'zht'];

function randHex4() {
  // Match UWUVCI: random in [0x3000, 0xFFFF]
  return (0x3000 + crypto.randomInt(0x10000 - 0x3000)).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Port of UWUVCI's EditXML: randomizes title id / group id / product code and
 * sets the game name in meta.xml and app.xml. Returns { titleId, prodCode }.
 */
function editBaseXmls(metaXmlPath, appXmlPath, gameName, shortNameArg) {
  const id = randHex4() + randHex4();
  const id2 = randHex4();
  const titleId = `00050002${id}`;

  let name = gameName || '';
  if (name.includes('|')) {
    const parts = name.split('|');
    name = parts[0] + ',' + parts[1];
  }
  const longName = name.replace(/,/g, '\n');
  const shortName = shortNameArg || name.split(',')[0];

  let meta = fs.readFileSync(metaXmlPath, 'utf8');
  if (name) {
    for (const l of LANGS) meta = setTag(meta, `longname_${l}`, longName);
    for (const l of LANGS) meta = setTag(meta, `shortname_${l}`, shortName);
  }
  meta = setTag(meta, 'product_code', `WUP-N-${id2}`);
  meta = setTag(meta, 'title_id', titleId);
  meta = setTag(meta, 'group_id', `0000${id2}`);
  meta = setTag(meta, 'drc_use', '65537');
  fs.writeFileSync(metaXmlPath, meta);

  let app = fs.readFileSync(appXmlPath, 'utf8');
  app = setTag(app, 'title_id', titleId);
  app = setTag(app, 'group_id', `0000${id2}`);
  fs.writeFileSync(appXmlPath, app);

  return { titleId, prodCode: id2 };
}

function setReservedFlag2(metaXmlPath, hexValue) {
  let meta = fs.readFileSync(metaXmlPath, 'utf8');
  meta = setTag(meta, 'reserved_flag2', hexValue);
  fs.writeFileSync(metaXmlPath, meta);
}

module.exports = { editBaseXmls, setReservedFlag2, setTag };
