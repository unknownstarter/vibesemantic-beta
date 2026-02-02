import nextConfig from "eslint-config-next"

const eslintConfig = [
  { ignores: [".venv/**"] },
  ...nextConfig,
  {
    rules: {
      // 동적 생성 차트 이미지(/api/outputs/)는 next/image 사용 불가
      "@next/next/no-img-element": "off",
    },
  },
]

export default eslintConfig
