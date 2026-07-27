import openpyxl, re, json
SRC='/root/.claude/uploads/51166998-ae84-50ed-8a90-014cedcca426/d1009f89-Ruan_12Week_Powerlifting_Program.xlsx'
wb=openpyxl.load_workbook(SRC, data_only=True)

DOW={'MONDAY':('Mon',1),'WEDNESDAY':('Wed',2),'FRIDAY':('Fri',3)}
ALLOWED_RPE={6,6.5,7,7.5,8,8.5,9,9.5,10}
def block_label(w):
    return ('Volume' if w in (1,2,3) else 'Deload' if w in (4,8) else
            'Strength' if w in (5,6,7) else 'Intensity' if w in (9,10,11) else 'Test')
DAYLIFT={1:'Squat',2:'Bench',3:'Deadlift'}

def numish(v):
    return isinstance(v,(int,float))

def clean_reps(c):
    if c is None: return None
    if isinstance(c,(int,float)):
        return str(int(c)) if float(c).is_integer() else str(c)
    return str(c).strip()

days=[]
cur=None; week=None
for sheet in ['Block 1','Block 2','Block 3']:
    ws=wb[sheet]
    for r in ws.iter_rows(values_only=True):
        A=r[0]
        if A is None or str(A).strip()=='' : continue
        s=str(A).strip()
        mW=re.match(r'WEEK\s+(\d+)', s, re.I)
        if mW:
            week=int(mW.group(1)); continue
        up=s.upper()
        day_hit=None
        for k,(dow,dn) in DOW.items():
            if up.startswith(k): day_hit=(dow,dn); break
        if day_hit:
            dow,dn=day_hit
            cur={'key':f'W{week}D{dn}','week':week,'dow':dow,'dayNum':dn,
                 'focus':f'{block_label(week)} · {DAYLIFT[dn]}','items':[]}
            days.append(cur); continue
        if s=='Exercise' or cur is None: continue
        # exercise row
        name=s; sets=r[1]; reps=r[2]; pct=r[3]; rpe=r[4]; load=r[5]
        note_sheet=r[9] if len(r)>9 else None
        notes=[]
        # DB per-hand
        if '(kg per hand)' in name:
            name=name.replace('(kg per hand)','').strip()
            notes.append('kg per hand')
        # strip parenthetical count cues but keep meaningful variation tags like (2ct)
        # set-role suffix after em dash -> note
        if '—' in name:
            base,role=[x.strip() for x in name.split('—',1)]
            name=base; notes.insert(0, role)
        item={'ex':name}
        sets_n = int(sets) if numish(sets) else None
        reps_s = clean_reps(reps)
        # rx
        rx = ''
        if sets_n is not None and reps_s: rx=f'{sets_n}×{reps_s}'
        elif reps_s: rx=reps_s
        rpe_s = None
        if rpe is not None and str(rpe).strip() not in ('','—','-'):
            rpe_s=str(rpe).strip()
            rx=(rx+f' · RPE {rpe_s}').strip(' ·')
        item['rx']=rx
        if load is not None and numish(load):
            item['load']=float(load)
        if sets_n is not None: item['sets']=sets_n
        if reps_s is not None and re.fullmatch(r'\d+', reps_s): item['reps']=int(reps_s)
        # prefill rpe number
        if rpe_s:
            m=re.search(r'\d+(\.\d+)?', rpe_s)
            if m and float(m.group()) in ALLOWED_RPE:
                item['rpe']=float(m.group())
        # %TM note
        if pct is not None and numish(pct):
            p=round(float(pct)*100,1)
            p=int(p) if float(p).is_integer() else p
            notes.append(f'{p}% TM')
        if note_sheet: notes.append(str(note_sheet).strip())
        if notes: item['note']=' · '.join(notes)
        cur['items'].append(item)

print(f'days: {len(days)}', file=__import__('sys').stderr)
print(json.dumps(days, ensure_ascii=False))
