# CIA Platform - Product & Business Roadmap

**Last Updated:** November 24, 2025
**Vision:** Build passive income ($40-50K/year) to retire parents while solving real assessment problems

---

## **What We Built**

A **secure remote assessment platform** with:
- **Dual-camera proctoring** (main camera for face, second camera for workspace)
- **AI face detection** (TensorFlow.js - client-side, privacy-friendly)
- **Professional intervention protocol** (15-second verbal recording before action)
- **Chunk-based recording** (60-second uploads to Google Drive for reliability)
- **Live monitoring dashboard** (WebRTC streaming of both cameras)
- **Audio segment delivery** (Bunny.net CDN with visual waveform editor)
- **Warmup mode** (practice segments before graded test)

**Originally built for:** Consecutive Interpreting Assessment (medical/court interpreters)

**Now realizing:** This works for ANY high-stakes remote assessment requiring security and authenticity

---

## **Business Model - The Simple Path**

### **Core Strategy:**
- Focus on **high-stakes professional certifications** (not general recruiting)
- Price at **$49-149/month** (impulse-buy territory, no enterprise sales cycles)
- Build to **100-120 paying customers** in 18-24 months
- Hire support at 50 customers to scale
- Work 10-15 hours/week once mature

### **Why This Works:**
- **Profit margins: 95-99%** (costs ~$50/month even at 100 customers)
- **100 customers × $49 = $4,900/month = $58K/year profit**
- **120 customers × $49 = $5,880/month = $70K/year profit**
- Enough to retire parents ($40K/year) + runway for next project

### **NOT Competing With:**
- Spark Hire, HireVue, VidCruiter (general recruiting - crowded market)
- We'd lose on brand recognition, integrations, polish

### **Competing With:**
- ProctorU ($15-20/test) - enterprise proctoring
- Honorlock ($10-15/test) - automated proctoring
- Proctorio ($8-12/test) - browser-based proctoring

**Our advantage:** 70% cheaper, dual camera, self-hosted option, customizable

---

## **Target Markets (Prioritized)**

### **Primary: Professional Certification Bodies**
**Who:**
- Medical interpreter certification (CCHI, state programs)
- Court interpreter certification (federal/state programs)
- Language proficiency testing (universities, agencies)
- Healthcare skills assessment (nursing, allied health)

**Why they'll pay:**
- High-stakes = security matters
- Dual camera prevents cheating better than single
- Current solutions are 3-5x more expensive
- Regulatory compliance requirements

**Pricing:** $49-149/month per institution (unlimited tests)

### **Secondary: Self-Hosted Enterprise**
**Who:**
- Government agencies (can't use cloud services)
- Healthcare systems (HIPAA compliance)
- Financial services (regulatory requirements)
- EU institutions (GDPR strict requirements)

**Why they'll pay:**
- Must host on their infrastructure
- Full data control required
- No third-party vendor risk

**Pricing:** $499/month OR $50K+ one-time + support contract

### **Tertiary: Educational Institutions**
**Who:**
- Universities with interpreting programs
- Medical schools (OSCE skills exams)
- Law schools (deposition practice)
- Language schools (certification prep)

**Why they'll pay:**
- Need standardized assessment
- Remote/hybrid learning trend
- Budget constraints (cheaper than live proctors)

**Pricing:** $49-149/month

---

## **Pricing Structure**

### **Option A: Simple Single Tier (Recommended to Start)**
- **$49/month** - unlimited tests, 2 admin users, email support
- 14-day free trial
- Annual option: $490/year (2 months free)

**Advantage:** Dead simple, easy decision, impulse buy territory

### **Option B: Three Tiers (After First 20 Customers)**
- **Starter:** $49/month - Up to 50 tests/year, 1 admin
- **Professional:** $149/month - Up to 200 tests/year, 3 admins, priority support
- **Enterprise:** $499/month - Unlimited tests, unlimited admins, live monitoring, custom branding

**Advantage:** Captures more value from larger customers, most pick middle tier

**Start with A, migrate to B once you validate pricing.**

---

## **Path to 100 Customers (18-24 Months)**

### **Phase 1: First 10 Customers (Months 1-3)**
**Goal:** Prove people will pay, get testimonials

**Actions:**
1. Polish landing page (simple: problem → solution → pricing → signup)
2. Set up Stripe billing (14-day trial, auto-charge after)
3. Create 2-minute demo video
4. Direct outreach to 50 language/interpreter programs
   - Use your network
   - LinkedIn: find program directors
   - Email: "I built this for my own interpreting program, now offering to others"
5. Offer "founding customer" deal: $49/month locked in forever
6. Post on Reddit (r/languagelearning), Indie Hackers, LinkedIn

**Success metric:** 10 paying customers (even if some are on trial)

### **Phase 2: First 30 Customers (Months 4-9)**
**Goal:** Build credibility, start word-of-mouth engine

**Actions:**
1. Get testimonials from first 10 customers (video if possible)
2. Create case study: "[Program Name] cut proctoring costs 75%"
3. Build referral program: Give 1 month free for each referral
4. Content marketing:
   - Blog: "How to proctor remote language assessments"
   - Blog: "Dual-camera proctoring: Why two angles matter"
   - Share on social media
5. Outreach to adjacent markets (medical interpreters, court programs)
6. Attend 1-2 relevant conferences (if budget allows)

**Success metric:** 30 paying customers, 5+ testimonials

### **Phase 3: Scale to 70 Customers (Months 10-18)**
**Goal:** Reach cash-flow sustainability for parents' retirement

**Actions:**
1. Hire part-time VA for customer support ($500-800/month)
2. Double down on what's working:
   - If referrals work → incentivize more
   - If content works → publish weekly
   - If ads work → increase budget
3. Partner with industry associations (get listed as vendor)
4. Create self-service resources (reduce support load):
   - Video tutorials for common tasks
   - FAQ with search
   - In-app tooltips
5. Consider tiered pricing ($49/$149/$499) if customers ask for more

**Success metric:** 70 customers = $3,430/month = $41K/year (parents retired!)

### **Phase 4: Scale to 120+ (Months 19-24)**
**Goal:** Build buffer, prepare for autopilot mode

**Actions:**
1. Hire part-time developer for maintenance ($1,000/month, 10 hours)
2. Implement annual billing (lock in customers)
3. Expand to 2-3 adjacent verticals (medical, legal, corporate)
4. Build integration with 1-2 popular LMS systems (if requested)
5. Document everything for handoff
6. Consider: Keep growing OR sell OR autopilot mode

**Success metric:** 120 customers = $5,880/month = $70K/year profit

---

## **Technical Roadmap**

### **Must-Have Before Launch (Week 1-2)**
- [ ] Clean landing page with clear value prop
- [ ] Stripe integration (subscription + trial)
- [ ] Self-service signup flow
- [ ] Automated welcome email with tutorial link
- [ ] Basic documentation (getting started guide)
- [ ] Demo video (2-3 minutes)
- [ ] Contact/support email setup

### **Nice-to-Have (Months 1-6)**
- [ ] Video tutorials for common tasks
- [ ] Searchable FAQ
- [ ] Email drip sequence for trials (onboarding tips)
- [ ] Usage analytics dashboard (for admins)
- [ ] Annual billing option
- [ ] Referral system

### **Growth Features (Months 6-12)**
- [ ] Custom branding (upload logo, colors)
- [ ] Multi-user accounts (team members)
- [ ] Role-based permissions (admin vs. reviewer)
- [ ] API for integrations
- [ ] Webhooks for automation

### **Scale Features (Months 12-18)**
- [ ] White-label option (custom domain)
- [ ] SSO integration (SAML/OAuth)
- [ ] Advanced analytics (completion rates, intervention patterns)
- [ ] Template marketplace (users share question sets)
- [ ] Mobile app (better camera control)

### **Optimization/Maintenance (Ongoing)**
- [ ] Performance monitoring (Sentry or similar)
- [ ] Automated testing (prevent regressions)
- [ ] Database migration (move off in-memory sessions to Redis/PostgreSQL)
- [ ] CDN for static assets (faster page loads)
- [ ] SEO optimization (organic traffic)

---

## **What NOT to Build**

Avoid these distractions until you hit 100+ customers:

❌ **AI grading/scoring** - Complex, expensive, customers don't need it yet
❌ **Multiple verticals at once** - Stay focused on high-stakes certification
❌ **Enterprise features** - Don't build for customers you don't have
❌ **Mobile apps** - Web works fine, native apps are 10x the work
❌ **Custom integrations** - Only if 10+ customers request same integration
❌ **Marketplace** - Network effects require scale you don't have yet
❌ **Advanced analytics** - Nice-to-have, not need-to-have

**Rule:** Only build what 3+ paying customers explicitly request.

---

## **Current State (As of Nov 2025)**

### **What's Working:**
✅ Dual-camera setup (main + proctor via PIN)
✅ Face detection with real-time feedback
✅ Recording with 60-second chunk uploads
✅ Intervention protocol (verbal recording + action selection)
✅ Warmup mode (practice before graded test)
✅ Admin dashboard (live monitoring + recordings review)
✅ Audio segment management (waveform editor + Bunny.net upload)
✅ Screen sharing enforcement (entire desktop only)

### **Known Issues to Fix:**
- In-memory session storage (will break if server restarts)
- No automated backups
- No usage analytics
- No self-service signup (Stripe not integrated yet)
- No onboarding flow for new customers
- Support is manual (no ticketing system)

### **Technical Debt:**
- Need to migrate to PostgreSQL or Redis for session persistence
- Should add error tracking (Sentry)
- Need automated tests for critical flows
- Should optimize bundle size (TensorFlow.js is heavy)

---

## **Key Metrics to Track**

### **Customer Acquisition:**
- **Sign-ups per week** (from trial to paid)
- **Conversion rate** (trial → paid)
- **Customer acquisition cost** (CAC) - how much to get one customer
- **Time to first customer value** (how long until they run first test)

### **Revenue:**
- **Monthly Recurring Revenue (MRR)**
- **Annual Run Rate (ARR)** = MRR × 12
- **Average Revenue Per User (ARPU)**

### **Customer Health:**
- **Churn rate** (% who cancel each month) - target <5%
- **Customer lifetime value (LTV)** = ARPU ÷ churn rate
- **Active usage** (tests per customer per month)
- **Support tickets per customer**

### **North Star Metric:**
**Number of paying customers** (everything else follows from this)

**Milestones:**
- 10 customers = proof people will pay
- 30 customers = product-market fit
- 70 customers = parents retired ($41K/year)
- 120 customers = comfortable buffer ($70K/year)
- 200 customers = sell for $400K-600K OR work 5 hours/week

---

## **Revenue Projections**

### **Conservative (50% of plan):**
| Month | Customers | MRR | ARR |
|-------|-----------|-----|-----|
| 3 | 5 | $245 | $2,940 |
| 6 | 15 | $735 | $8,820 |
| 12 | 35 | $1,715 | $20,580 |
| 18 | 60 | $2,940 | $35,280 |
| 24 | 90 | $4,410 | $52,920 |

### **Realistic (on plan):**
| Month | Customers | MRR | ARR |
|-------|-----------|-----|-----|
| 3 | 10 | $490 | $5,880 |
| 6 | 30 | $1,470 | $17,640 |
| 12 | 70 | $3,430 | $41,160 |
| 18 | 100 | $4,900 | $58,800 |
| 24 | 150 | $7,350 | $88,200 |

### **Aggressive (150% of plan):**
| Month | Customers | MRR | ARR |
|-------|-----------|-----|-----|
| 3 | 15 | $735 | $8,820 |
| 6 | 45 | $2,205 | $26,460 |
| 12 | 105 | $5,145 | $61,740 |
| 18 | 150 | $7,350 | $88,200 |
| 24 | 225 | $11,025 | $132,300 |

**Assumptions:** $49/month average, <5% monthly churn

---

## **When to Hire Help**

### **First Hire: Customer Support VA (at 50 customers)**
**Cost:** $500-800/month (part-time, overseas)
**Responsibilities:**
- Answer common questions ("How do I reset password?")
- Basic troubleshooting (video not uploading)
- Onboarding new customers
- Escalate technical issues to you

**Why:** Frees up 10-15 hours/week, you focus on growth + critical issues

### **Second Hire: Part-Time Developer (at 100 customers)**
**Cost:** $1,000-1,500/month (10-15 hours at $100/hour)
**Responsibilities:**
- Bug fixes
- Small feature additions
- Maintenance and updates
- Code reviews

**Why:** Frees up another 10 hours/week, you focus on business decisions

### **At 150+ customers:**
**Revenue:** $7,350/month
**Costs:** $50 (infrastructure) + $800 (VA) + $1,500 (dev) = $2,350/month
**Your profit:** $5,000/month = $60K/year
**Your time:** 10 hours/week

**This is the dream state.**

---

## **Exit Options**

### **Option 1: Keep as Passive Income (Recommended)**
**When:** Hit 100-120 customers ($50-60K/year profit)
**What:** Hire VA + developer, work 10 hours/week, give parents $40K/year
**Pros:** Recurring income, work on next project, keep ownership
**Cons:** Not a lump sum

### **Option 2: Sell the Business**
**When:** Hit $100K+ ARR (200+ customers)
**Sale price:** $200K-400K (2-4x annual revenue for small SaaS)
**Platforms:** Acquire.com, MicroAcquire, Flippa
**Pros:** Lump sum to retire parents
**Cons:** Lose recurring income

### **Option 3: Enterprise Acquisition**
**When:** Find the right buyer (ProctorU, Honorlock, EdTech platform)
**Sale price:** $300K-1M (depends on strategic value)
**Approach:** Direct outreach with pitch deck
**Pros:** Larger exit, faster timeline
**Cons:** Harder to find buyer, may not materialize

### **Option 4: Raise Funding & Scale**
**When:** Hit $500K ARR with strong growth
**Raise:** $2-5M seed round
**Use:** Hire sales team, expand markets
**Pros:** 10x potential ($50M+ exit)
**Cons:** Give up ownership, years of work, not aligned with your "solve problem and move on" goal

**My recommendation: Option 1 until you decide if you want to keep growing or sell.**

---

## **Marketing & Sales Strategy**

### **Channels to Focus On (Prioritized):**

**1. Direct Outreach (Months 1-6)**
- LinkedIn: Find program directors, send personalized messages
- Email: Build list of 200+ target organizations, send weekly
- Cold calls: Follow up with email leads
- **Goal:** 1-2 customers/week

**2. Content Marketing (Months 3-12)**
- Blog posts: "How to proctor remote assessments", "Dual-camera method"
- Case studies: Real customer success stories
- Video demos: Show the product in action
- SEO: Rank for "remote proctoring", "language assessment"
- **Goal:** 5-10 inbound leads/month

**3. Referral Program (Months 6-18)**
- Give 1 month free for each successful referral
- Ask happy customers to refer others
- Share in industry communities
- **Goal:** 20-30% of new customers from referrals

**4. Partnerships (Months 9-18)**
- Industry associations (get listed as vendor)
- Consulting firms (revenue share)
- Software integrations (Canvas, Blackboard)
- **Goal:** 10-20 customers from partnerships

**5. Paid Ads (Months 12+)**
- Google Ads: "remote proctoring software"
- LinkedIn Ads: Target program directors
- Small budget: $500-1,000/month to test
- **Goal:** CAC < $200 (4 months to payback)

### **What NOT to Do:**
❌ Conferences (expensive, low ROI until you have brand)
❌ PR/media (vanity metric, doesn't drive B2B sales)
❌ Social media (Twitter/Instagram) - wrong audience
❌ Affiliate marketing (doesn't work for B2B SaaS)

---

## **Success Criteria**

### **After 6 Months:**
✅ 20-30 paying customers
✅ <10% monthly churn
✅ 2-3 strong testimonials
✅ $1,000-1,500/month revenue
✅ Product is stable (no critical bugs)

**Decision:** Keep going OR pivot focus

### **After 12 Months:**
✅ 60-80 paying customers
✅ <5% monthly churn
✅ $3,000-4,000/month revenue
✅ Hired VA for support
✅ Working <30 hours/week

**Decision:** This is working, scale up OR autopilot mode

### **After 18 Months:**
✅ 100-120 paying customers
✅ $5,000-6,000/month revenue
✅ Parents retired on passive income
✅ Working <15 hours/week
✅ Hired developer for maintenance

**Decision:** Keep growing, sell, or move to next project while this runs

---

## **Why This Will Work**

**1. You've already built it** - No need to validate technical feasibility
**2. You understand the market** - You know the pain points firsthand
**3. Profit margins are insane** - 95%+ means every customer is nearly pure profit
**4. Price point is perfect** - $49/month is impulse-buy territory
**5. Market is huge enough** - Need 0.01% of addressable market
**6. Competition is expensive** - You're 70% cheaper than ProctorU
**7. Your goal is realistic** - $50K/year, not $50M

---

## **Final Thoughts**

This is not a "build a unicorn" plan. This is a "solve a real problem, make enough money to retire parents, move on to next problem" plan.

**Timeline:** 18-24 months to financial goal
**Work required:** Significant but not crazy (20-30 hours/week)
**Risk:** Low (costs are ~$50/month, you can always shut down)
**Reward:** $40-60K/year passive income, parents retired, freedom to build next thing

**This is absolutely achievable.**

The code works. The margins are insane. The market exists. You just need to hustle on customer acquisition for 18 months.

**Let's build this.**

---

## **Next Steps (Week 1)**

1. [ ] Fix critical bugs (list in separate doc)
2. [ ] Create simple landing page
3. [ ] Set up Stripe billing
4. [ ] Write 5 cold email templates
5. [ ] List 50 target organizations
6. [ ] Create 2-minute demo video
7. [ ] Set up support email (support@yourplatform.com)
8. [ ] Launch to first 10 prospects

**Start here. Everything else builds on this foundation.**
