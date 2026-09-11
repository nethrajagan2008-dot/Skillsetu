// Static domain config shared across routes. Trade/criteria *display* names
// live in the frontend i18n files (keyed the same way) — the backend only
// needs stable keys plus numeric relationships (overlap %, bridge duration).

const TRADES = ['tailoring', 'electrical', 'carpentry', 'embroidery', 'packing', 'plumbing', 'masonry', 'welding'];

const RUBRIC = {
  tailoring: ['seam', 'density', 'fabric', 'safety'],
  electrical: ['insul', 'load', 'safety', 'finish'],
  carpentry: ['measure', 'joint', 'finish', 'safety'],
  embroidery: ['pattern', 'tension', 'finish', 'safety'],
  packing: ['accuracy', 'speed', 'labeling', 'safety'],
  plumbing: ['fitting', 'sealing', 'pressure', 'safety'],
  masonry: ['alignment', 'mortar', 'finish', 'safety'],
  welding: ['bead', 'penetration', 'alignment', 'safety'],
};

// adjacency: [neighbourTrade, overlapPercent, bridgeWeeks]
const GRAPH_MAP = {
  tailoring: [['embroidery', 87, 2], ['carpentry', 64, 3], ['packing', 40, 1]],
  electrical: [['carpentry', 55, 3], ['plumbing', 58, 3], ['welding', 46, 4]],
  carpentry: [['electrical', 52, 4], ['tailoring', 64, 3], ['masonry', 61, 3]],
  embroidery: [['tailoring', 87, 2], ['packing', 35, 1]],
  packing: [['carpentry', 40, 2], ['tailoring', 40, 1]],
  plumbing: [['electrical', 58, 3], ['masonry', 50, 3]],
  masonry: [['carpentry', 61, 3], ['plumbing', 50, 3]],
  welding: [['electrical', 46, 4], ['carpentry', 45, 4]],
};

const BADGE_DEFS = ['first_verified', 'gig_starter', 'gig_pro', 'high_score', 'multi_skill', 'top_rated'];

module.exports = { TRADES, RUBRIC, GRAPH_MAP, BADGE_DEFS };
