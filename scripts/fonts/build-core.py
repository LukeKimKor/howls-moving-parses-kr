"""Build a renamed OFL-compliant UI subset; no provider requests or runtime dependency."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--tools', type=Path)
args = parser.parse_args()
if args.tools:
    sys.path.insert(0, str(args.tools.resolve()))
import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

project = Path(__file__).resolve().parents[2]
source = args.source.read_bytes()
source_blob = hashlib.sha1(f'blob {len(source)}\0'.encode() + source).hexdigest()
if source_blob != '49c54b5152a184a243e85f7281ed338b6569987e':
    raise ValueError('Expected the unmodified official Pretendard 1.3.9 variable font')
text = ''.join(chr(i) for i in range(0x20, 0x7f))
for file in sorted((project / 'src').rglob('*')):
    if file.suffix in ('.ts', '.tsx') and '__tests__' not in file.parts:
        text += file.read_text(encoding='utf-8')
text += (project / 'characters.config.json').read_text(encoding='utf-8')
original = TTFont(args.source, recalcTimestamp=False)
unicodes = sorted({ord(c) for c in text} & original.getBestCmap().keys())
font = TTFont(args.source, recalcTimestamp=False)
options = subset.Options()
options.layout_features = ['*']  # Preserve tabular numerals and shaping features.
options.name_IDs = ['*']
options.name_languages = ['*']
options.name_legacy = True
options.glyph_names = True
worker = subset.Subsetter(options=options)
worker.populate(unicodes=unicodes)
worker.subset(font)

# OFL 1.1 reserves the original primary name. Acknowledge the source in the
# copyright/license/description fields, and give the modified subset its own name.
protected = {0, 7, 8, 9, 11, 13, 14}
for record in font['name'].names:
    if record.nameID in protected:
        continue
    value = record.toUnicode()
    value = value.replace('Pretendard Variable', 'HMP Dashboard Sans')
    value = value.replace('PretendardVariable', 'HMPDashboardSans')
    value = value.replace('Pretendard', 'HMPDashboardSans')
    if record.nameID in (1, 4, 16):
        value = 'HMP Dashboard Sans'
    if record.nameID == 6:
        value = 'HMPDashboardSans-Regular'
    record.string = value.encode(record.getEncoding())
font.flavor = 'woff2'
output = project / 'public/fonts/HmpDashboardSansCore.woff2'
font.save(output)
rebuilt = TTFont(output, recalcTimestamp=False)
assert set(unicodes) <= rebuilt.getBestCmap().keys()
assert [(a.axisTag, a.minValue, a.maxValue) for a in original['fvar'].axes] == [(a.axisTag, a.minValue, a.maxValue) for a in rebuilt['fvar'].axes]
assert all('Pretendard' not in n.toUnicode() for n in rebuilt['name'].names if n.nameID in (1, 4, 6, 16, 25))

checked = 0
sample = set('와우대시보드오렌지크림피자태상이를존경했다앙귀태영혼살무사네크잘리0123456789%.—/')
for weight in (400, 500, 650, 700):
    before, after = original.getGlyphSet(location={'wght': weight}), rebuilt.getGlyphSet(location={'wght': weight})
    for char in sample:
        point = ord(char)
        if point not in rebuilt.getBestCmap():
            continue
        a = before[original.getBestCmap()[point]]
        b = after[rebuilt.getBestCmap()[point]]
        pa, pb = DecomposingRecordingPen(before), DecomposingRecordingPen(after)
        a.draw(pa); b.draw(pb)
        assert a.width == b.width and pa.value == pb.value, (char, weight)
        checked += 1

data = output.read_bytes()
manifest = {'family': 'HMP Dashboard Sans', 'derivedFrom': 'Pretendard Variable 1.3.9', 'sourceGitBlobSha': source_blob,
            'license': 'SIL-OFL-1.1', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'gitBlobSha': hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest(),
            'unicodeCount': len(unicodes), 'unicodes': unicodes, 'fontToolsVersion': fontTools.__version__,
            'outlineAndAdvanceComparisons': checked, 'variableWeightRange': [45, 920], 'outlinesUnchanged': True}
(project / 'public/fonts/core-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in manifest.items() if k != 'unicodes'}))
