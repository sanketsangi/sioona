"""Analyze user-exported GSC CSVs locally. No Google login or API spend."""
import argparse
import csv
import json
import math
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('csv', type=Path, help='English-language GSC Queries or Pages CSV export')
parser.add_argument('--min-impressions', type=int, default=100)
parser.add_argument('--max-ctr', type=float, default=0.02, help='CTR fraction; default 0.02 = 2%%')
parser.add_argument('--out', type=Path, default=Path('reports/gsc-opportunities.json'))
args = parser.parse_args()
if args.min_impressions < 0 or not 0 <= args.max_ctr <= 1:
    parser.error('Use nonnegative impressions and a CTR fraction between 0 and 1')

def number(value):
    text = str(value).strip().replace(',', '')
    if text.endswith('%'):
        return float(text[:-1]) / 100
    return float(text)

rows = []
with args.csv.open(encoding='utf-8-sig', newline='') as source:
    reader = csv.DictReader(source)
    headers = reader.fieldnames or []
    dimensions = [key for key in headers if key not in ['Clicks', 'Impressions', 'CTR', 'Position']]
    if not dimensions or not {'Clicks', 'Impressions', 'CTR', 'Position'}.issubset(headers):
        parser.error('Expected English GSC export with dimension, Clicks, Impressions, CTR and Position columns')
    for line, row in enumerate(reader, 2):
        try:
            item = {key: row[key] for key in dimensions}
            item.update(clicks=number(row['Clicks']), impressions=number(row['Impressions']), ctr=number(row['CTR']), position=number(row['Position']))
            if not all(math.isfinite(item[k]) for k in ['ctr', 'impressions', 'clicks', 'position']):
                raise ValueError('metrics must be finite')
            if not (0 <= item['ctr'] <= 1 and item['impressions'] >= 0 and item['clicks'] >= 0 and item['position'] >= 0):
                raise ValueError('metrics outside valid ranges')
            rows.append(item)
        except (ValueError, TypeError) as exc:
            parser.error(f'Invalid metrics at CSV line {line}: {exc}')
eligible = sorted((r for r in rows if r['impressions'] >= args.min_impressions), key=lambda r: r['impressions'], reverse=True)
result = {
    'source': str(args.csv), 'rows': len(rows),
    'thresholds': {'minImpressions': args.min_impressions, 'maxCtr': args.max_ctr},
    'nearRankingCandidates': [r for r in eligible if 8 <= r['position'] <= 20],
    'lowCtrCandidates': [r for r in eligible if r['ctr'] < args.max_ctr],
    'limits': ['Candidates for investigation, not proof of a title/content problem.', 'GSC position is an average across impressions, not a fixed live rank.', 'Record date range, property, country and device filters alongside each export.', 'Do not sum overlapping exports. No search-volume or traffic uplift estimates are inferred.'],
}
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(result, indent=2) + '\n')
print(f"Read {len(rows)} rows; {len(result['nearRankingCandidates'])} near-ranking and {len(result['lowCtrCandidates'])} low-CTR candidates. Saved {args.out}")
