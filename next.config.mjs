const budgetingOrigin = "https://aicoachdir-budgeting.vercel.app";

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/budget/tracker",
        destination: `${budgetingOrigin}/tracker`,
      },
      {
        source: "/budget/coach",
        destination: `${budgetingOrigin}/coach`,
      },
      {
        source: "/budget/access",
        destination: `${budgetingOrigin}/access`,
      },
      {
        source: "/budget/api/:path*",
        destination: `${budgetingOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
