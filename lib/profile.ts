import { executePython } from './executor'
import type { DataProfile } from './types'

function buildProfileScript(filePath: string): string {
  return `
import pandas as pd, numpy as np, json, sys

df = pd.read_csv("${filePath}")
result = {"warnings": [], "correlations": [], "distributions": []}

# 1. 데이터 품질 검사
for col in df.columns:
    missing_pct = df[col].isna().mean() * 100
    if missing_pct > 5:
        result["warnings"].append({
            "type": "missing", "column": col,
            "severity": "high" if missing_pct > 20 else "medium",
            "detail": f"{missing_pct:.1f}% 결측 ({df[col].isna().sum()}/{len(df)}행)"
        })

# 2. 수치형 컬럼 이상치 (IQR)
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
for col in numeric_cols:
    Q1, Q3 = df[col].quantile([0.25, 0.75])
    IQR = Q3 - Q1
    if IQR > 0:
        outliers = int(((df[col] < Q1 - 1.5*IQR) | (df[col] > Q3 + 1.5*IQR)).sum())
        if outliers > 0:
            result["warnings"].append({
                "type": "outlier", "column": col,
                "severity": "high" if outliers/len(df) > 0.05 else "low",
                "detail": f"이상치 {outliers}건 ({outliers/len(df)*100:.1f}%)"
            })

# 3. 중복 행 검사
dup_count = int(df.duplicated().sum())
if dup_count > 0:
    result["warnings"].append({
        "type": "duplicate", "column": "(전체)",
        "severity": "medium" if dup_count/len(df) > 0.05 else "low",
        "detail": f"중복 행 {dup_count}건 ({dup_count/len(df)*100:.1f}%)"
    })

# 4. 상관관계 (수치형 컬럼 2개 이상일 때)
if len(numeric_cols) >= 2:
    corr = df[numeric_cols].corr(method='pearson')
    for i, c1 in enumerate(numeric_cols):
        for c2 in numeric_cols[i+1:]:
            r = corr.loc[c1, c2]
            if abs(r) > 0.5 and not np.isnan(r):
                result["correlations"].append({
                    "col1": c1, "col2": c2,
                    "coefficient": round(float(r), 3), "method": "pearson"
                })

# 5. 분포 정보 (수치형, 최대 10개)
for col in numeric_cols[:10]:
    s = df[col].dropna()
    if len(s) > 0:
        result["distributions"].append({
            "column": col,
            "mean": round(float(s.mean()), 2),
            "median": round(float(s.median()), 2),
            "std": round(float(s.std()), 2),
            "skew": round(float(s.skew()), 2),
            "min": round(float(s.min()), 2),
            "max": round(float(s.max()), 2)
        })

# 6. 품질 점수 (100 - 감점)
total_issues = len(result["warnings"])
quality = max(0, 100 - total_issues * 10)
result["qualityScore"] = quality
result["totalRows"] = len(df)

print(json.dumps(result, ensure_ascii=False))
`.trim()
}

export async function runSmartProfile(fileId: string, filePath: string): Promise<DataProfile> {
  const code = buildProfileScript(filePath)
  const result = await executePython(code, process.cwd(), 30000)

  if (result.exitCode !== 0) {
    // 프로파일링 실패 시 빈 프로파일 반환
    return {
      fileId,
      qualityScore: -1,
      totalRows: 0,
      warnings: [],
      correlations: [],
      distributions: [],
    }
  }

  try {
    const parsed = JSON.parse(result.stdout.trim())
    return {
      fileId,
      qualityScore: parsed.qualityScore ?? 0,
      totalRows: parsed.totalRows ?? 0,
      warnings: parsed.warnings ?? [],
      correlations: parsed.correlations ?? [],
      distributions: parsed.distributions ?? [],
    }
  } catch {
    return {
      fileId,
      qualityScore: -1,
      totalRows: 0,
      warnings: [],
      correlations: [],
      distributions: [],
    }
  }
}

// 테스트용으로 export
export { buildProfileScript }
