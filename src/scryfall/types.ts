/** The parts of a Scryfall card object Swapsmith uses (https://scryfall.com/docs/api/cards). */
export interface ScryCard {
  id: string;
  oracle_id?: string;
  name: string;
  /** An alternate name printed on some versions, e.g. "Panther Idol" on Mind's Eye. */
  flavor_name?: string;
  set: string;
  set_name: string;
  collector_number: string;
  type_line?: string;
  color_identity: string[];
  legalities: { commander?: string };
  finishes: string[];
  prices: { usd: string | null; usd_foil: string | null; usd_etched: string | null };
  tcgplayer_id?: number;
  tcgplayer_etched_id?: number;
  purchase_uris?: { tcgplayer?: string };
  image_uris?: { small?: string; normal?: string };
  card_faces?: Array<{ name: string; oracle_id?: string; type_line?: string; image_uris?: { small?: string; normal?: string } }>;
}

export interface ScryList<T> {
  object: 'list';
  data: T[];
  has_more?: boolean;
  total_cards?: number;
  not_found?: Array<Record<string, string>>;
}
