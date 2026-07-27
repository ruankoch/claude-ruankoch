#!/usr/bin/env python3
"""Parse Ruan's 12-week powerlifting workbook (Blocks 1-3) into the app's
ProgramDay[] shape, writing src/data/program12.ts.

Usage: python scripts/parse_12week.py path/to/workbook.xlsx
Handles Mon/Wed/Thu/Fri day headers, %TM + target-RPE, DB "per hand", and
set-role suffixes (warm-up / top single / back-off) which move to notes.
"""
import openpyxl, re, json, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    '/root/.claude/uploads/51166998-ae84-50ed-8a90-014cedcca426/ff9b549e-Ruan_12Week_Powerlifting_Program_1.xlsx'
OUT = '/home/user/claude-ruankoch/white-lights/src/data/program12.ts'

wb = openpyxl.load_workbook(SRC, data_only=True)
WEEKDAY = {'MONDAY':('Mon',1),'TUESDAY':('Tue',2),'WEDNESDAY':('Wed',3),
           'THURSDAY':('Thu',4),'FRIDAY':('Fri',5),'SATURDAY':('Sat',6),'SUNDAY':('Sun',7)}
ALLOWED_RPE = {6,6.5,7,7.5,8,8.5,9,9.5,10}
def numish(v): return isinstance(v,(int,float))
def clean_reps(c):
    if c is None: return None
    if isinstance(c,(int,float)):
        return str(int(c)) if float(c).is_integer() else str(c)
    return str(c).strip()
def block_label_from_header(h):
    H=h.upper()
    for key,lbl in (('DELOAD','Deload'),('LIGHT-MEDIUM','Deload'),('LIGHT MEDIUM','Deload'),
                    ('TEST','Test'),('VOLUME','Volume'),('STRENGTH','Strength'),('INTENSITY','Intensity')):
        if key in H: return lbl
    return ''

days=[]; cur=None; week=None; blabel=''
for sheet in ['Block 1','Block 2','Block 3']:
    ws=wb[sheet]
    for r in ws.iter_rows(values_only=True):
        A=r[0]
        if A is None or str(A).strip()=='': continue
        s=str(A).strip()
        mW=re.match(r'WEEK\s+(\d+)', s, re.I)
        if mW:
            week=int(mW.group(1)); blabel=block_label_from_header(s) or blabel; continue
        up=s.upper()
        wd=next((WEEKDAY[k] for k in WEEKDAY if up.startswith(k)), None)
        if wd:
            dow,dn=wd
            theme=s.split('—',1)[1] if '—' in s else ''
            theme=theme.split('(')[0].strip().title() or dow
            cur={'key':f'W{week}D{dn}','week':week,'dow':dow,'dayNum':dn,
                 'focus':f'{blabel} · {theme}' if blabel else theme,'items':[]}
            days.append(cur); continue
        if s=='Exercise' or cur is None: continue
        name=s; sets=r[1]; reps=r[2]; pct=r[3]; rpe=r[4]; load=r[5]
        note_sheet=r[9] if len(r)>9 else None
        notes=[]
        if '(kg per hand)' in name:
            name=name.replace('(kg per hand)','').strip(); notes.append('kg per hand')
        if '—' in name:
            base,role=[x.strip() for x in name.split('—',1)]; name=base; notes.insert(0,role)
        sets_n=int(sets) if numish(sets) else None
        reps_s=clean_reps(reps)
        # skip guidance/instruction lines that carry no prescription
        if sets_n is None and load is None and not (rpe not in (None,'','—','-')) \
           and not numish(pct) and not (reps_s and re.search(r'\d', reps_s)):
            continue
        item={'ex':name}
        rx=f'{sets_n}×{reps_s}' if (sets_n is not None and reps_s) else (reps_s or '')
        rpe_s=None
        if rpe is not None and str(rpe).strip() not in ('','—','-'):
            rpe_s=str(rpe).strip(); rx=(rx+f' · RPE {rpe_s}').strip(' ·')
        item['rx']=rx
        if load is not None and numish(load): item['load']=float(load)
        if sets_n is not None: item['sets']=sets_n
        if reps_s is not None and re.fullmatch(r'\d+',reps_s): item['reps']=int(reps_s)
        if rpe_s:
            m=re.search(r'\d+(\.\d+)?',rpe_s)
            if m and float(m.group()) in ALLOWED_RPE: item['rpe']=float(m.group())
        if pct is not None and numish(pct):
            p=round(float(pct)*100,1); p=int(p) if float(p).is_integer() else p
            notes.append(f'{p}% TM')
        if note_sheet: notes.append(str(note_sheet).strip())
        if notes: item['note']=' · '.join(notes)
        cur['items'].append(item)

body=',\n'.join('  '+json.dumps(d, ensure_ascii=False) for d in days)
ts=(
'/* 12-Week Powerlifting Progression — Ruan. Parsed from the workbook\n'
'   (Blocks 1-3) by scripts/parse_12week.py. Three 4-week blocks: Volume ->\n'
'   Deload -> Strength -> Deload -> Intensity -> Test, with an optional\n'
'   Thursday upper-pump day. Loads are the sheet\047s prescribed weights;\n'
'   main lifts are block-specific variations, shown as prescribed. */\n\n'
"import type { ProgramDay } from './program';\n\n"
'export const PROGRAM_12_NAME = "12-Week Powerlifting";\n\n'
'export const PROGRAM_12_DAYS: ProgramDay[] = [\n'
f'{body},\n];\n'
)
open(OUT,'w').write(ts)
print('days:',len(days),'| keys sample:',[d['key'] for d in days[:6]])
print('wrote',OUT,len(ts),'bytes')
