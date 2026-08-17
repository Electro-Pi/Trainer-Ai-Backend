import type { TrainingForm } from '@prisma/client';

import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

/**
 * The 8 canonical BRD tracks (§6.5) — not the reference frontend's 4-track
 * mock (MEMORY D-11: where the mock and the BRD disagree, the BRD wins).
 * `targetSkills`, `trainingForm` and `impactIndicators` are copied verbatim
 * from the BRD's §6.5 table. Levels (Beginner…Expert) and their outcomes are
 * not individually enumerated in the BRD — the client's L&D team owns that
 * detail in production (BRD §11.1 Assumptions) — so this seed constructs a
 * plausible, complete set per level so every downstream phase (content,
 * recommendation, plans, sessions) has real structure to build and test
 * against from Phase 1 onward.
 */

interface OutcomeSeed {
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  targetSkills: string[];
}

interface LevelSeed {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  outcomes: OutcomeSeed[];
}

interface TrackSeed {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  department: string;
  targetSkills: string[];
  trainingForm: TrainingForm;
  impactIndicators: string[];
  levels: LevelSeed[];
}

const LEVEL_TEMPLATE: { key: string; nameEn: string; nameAr: string }[] = [
  { key: 'beginner', nameEn: 'Beginner', nameAr: 'مبتدئ' },
  { key: 'intermediate', nameEn: 'Intermediate', nameAr: 'متوسط' },
  { key: 'advanced', nameEn: 'Advanced', nameAr: 'متقدم' },
  { key: 'expert', nameEn: 'Expert', nameAr: 'خبير' },
];

function buildLevels(
  trackKey: string,
  outcomesByLevel: [string, string][][],
  descriptionsEn: string[],
  descriptionsAr: string[],
): LevelSeed[] {
  return LEVEL_TEMPLATE.map((level, i) => ({
    key: level.key,
    nameEn: level.nameEn,
    nameAr: level.nameAr,
    descriptionEn: descriptionsEn[i] ?? '',
    descriptionAr: descriptionsAr[i] ?? '',
    outcomes: (outcomesByLevel[i] ?? []).map(([titleEn, titleAr], j) => ({
      titleEn,
      titleAr,
      descriptionEn: `${titleEn} — outcome ${j + 1} of the ${level.nameEn} level in ${trackKey}.`,
      descriptionAr: `${titleAr} — الهدف رقم ${j + 1} في مستوى ${level.nameAr}.`,
      targetSkills: [],
    })),
  }));
}

export const TRACKS: TrackSeed[] = [
  {
    key: 'sales',
    nameEn: 'Sales',
    nameAr: 'المبيعات',
    descriptionEn:
      'Builds the conversational and negotiation skills a sales team needs to discover needs, handle objections and close deals.',
    descriptionAr:
      'يبني مهارات الحوار والتفاوض التي يحتاجها فريق المبيعات لاكتشاف الاحتياجات والتعامل مع الاعتراضات وإتمام الصفقات.',
    department: 'Sales',
    targetSkills: ['Needs discovery', 'Objections', 'Negotiation', 'Value proposition'],
    trainingForm: 'CONVERSATION',
    impactIndicators: ['Conversion', 'Deal-closing time', 'Average deal value'],
    levels: buildLevels(
      'sales',
      [
        [
          ['Ask open discovery questions', 'طرح أسئلة استكشاف مفتوحة'],
          ['Explain the core value proposition', 'شرح عرض القيمة الأساسي'],
        ],
        [
          ['Handle common objections', 'التعامل مع الاعتراضات الشائعة'],
          ['Qualify a lead against ICP criteria', 'تأهيل العميل المحتمل وفق معايير العميل المثالي'],
        ],
        [
          ['Run a structured negotiation', 'إدارة تفاوض منظم'],
          ['Tailor the pitch to buyer persona', 'تكييف العرض حسب شخصية المشتري'],
        ],
        [
          ['Close complex, multi-stakeholder deals', 'إغلاق صفقات معقدة متعددة الأطراف'],
          ['Coach a peer on the sales process', 'توجيه زميل في عملية البيع'],
        ],
      ],
      [
        'Foundations of a sales conversation.',
        'Handling resistance and qualifying opportunity.',
        'Negotiation and persona-tailored pitching.',
        'Complex deals and peer coaching.',
      ],
      [
        'أساسيات محادثة البيع.',
        'التعامل مع الممانعة وتأهيل الفرص.',
        'التفاوض وتخصيص العرض.',
        'الصفقات المعقدة وتوجيه الزملاء.',
      ],
    ),
  },
  {
    key: 'project-management',
    nameEn: 'Project Management',
    nameAr: 'إدارة المشاريع',
    descriptionEn:
      'Develops planning, risk management, scope control and communication skills through project cases and decision simulations.',
    descriptionAr:
      'يطور مهارات التخطيط وإدارة المخاطر والتحكم في النطاق والتواصل من خلال حالات مشاريع ومحاكاة قرارات.',
    department: 'Project Management',
    targetSkills: ['Planning', 'Risk management', 'Scope', 'Communication'],
    trainingForm: 'CASE',
    impactIndicators: ['On-time delivery', 'Budget overrun', 'Risk closure'],
    levels: buildLevels(
      'project-management',
      [
        [
          ['Build a basic project schedule', 'إعداد جدول مشروع أساسي'],
          ['Define project scope', 'تحديد نطاق المشروع'],
        ],
        [
          ['Identify and log project risks', 'تحديد مخاطر المشروع وتسجيلها'],
          ['Run an effective status meeting', 'إدارة اجتماع متابعة فعال'],
        ],
        [
          ['Manage scope change requests', 'إدارة طلبات تغيير النطاق'],
          ['Mitigate a high-severity risk', 'التخفيف من مخاطرة عالية الخطورة'],
        ],
        [
          ['Recover a delayed, over-budget project', 'إنقاذ مشروع متأخر ومتجاوز للميزانية'],
          ['Align multiple stakeholders on a decision', 'مواءمة عدة أطراف معنية حول قرار'],
        ],
      ],
      [
        'Scheduling and scope fundamentals.',
        'Risk identification and status communication.',
        'Change control and risk mitigation.',
        'Recovery and stakeholder alignment.',
      ],
      [
        'أساسيات الجدولة والنطاق.',
        'تحديد المخاطر والتواصل حول الحالة.',
        'إدارة التغيير والتخفيف من المخاطر.',
        'الإنقاذ ومواءمة الأطراف المعنية.',
      ],
    ),
  },
  {
    key: 'customer-service',
    nameEn: 'Customer Service',
    nameAr: 'خدمة العملاء',
    descriptionEn:
      'Trains listening, empathy and problem-solving through voice and text conversation practice.',
    descriptionAr: 'يدرب على الإصغاء والتعاطف وحل المشكلات من خلال محادثات صوتية ونصية.',
    department: 'Customer Service',
    targetSkills: ['Listening', 'Empathy', 'Problem solving'],
    trainingForm: 'CONVERSATION',
    impactIndicators: ['Customer satisfaction', 'First-contact resolution', 'Escalation'],
    levels: buildLevels(
      'customer-service',
      [
        [
          ['Greet and actively listen to a customer', 'الترحيب بالعميل والإصغاء الفعّال له'],
          ['Follow a standard resolution script', 'اتباع نص حل قياسي'],
        ],
        [
          ['De-escalate a frustrated customer', 'تهدئة عميل منزعج'],
          ['Resolve a routine issue on first contact', 'حل مشكلة روتينية من أول تواصل'],
        ],
        [
          ['Handle a multi-issue complaint', 'التعامل مع شكوى متعددة المشكلات'],
          ['Apply empathy without over-promising', 'إظهار التعاطف دون وعود مبالغ فيها'],
        ],
        [
          ['Resolve an escalated, high-stakes case', 'حل حالة متصاعدة عالية الأهمية'],
          ['Mentor a peer on de-escalation', 'توجيه زميل في مهارات التهدئة'],
        ],
      ],
      [
        'Listening and following the script.',
        'De-escalation and first-contact resolution.',
        'Complex complaints and calibrated empathy.',
        'High-stakes escalations and mentoring.',
      ],
      [
        'الإصغاء واتباع النص.',
        'التهدئة وحل أول تواصل.',
        'الشكاوى المعقدة والتعاطف المتزن.',
        'التصعيدات الحرجة والتوجيه.',
      ],
    ),
  },
  {
    key: 'leadership',
    nameEn: 'Leadership',
    nameAr: 'القيادة',
    descriptionEn:
      'Builds feedback, delegation and performance management skills through roleplay with a virtual employee.',
    descriptionAr:
      'يبني مهارات إعطاء الملاحظات والتفويض وإدارة الأداء من خلال تمثيل أدوار مع موظف افتراضي.',
    department: 'Leadership',
    targetSkills: ['Feedback', 'Delegation', 'Performance management'],
    trainingForm: 'ROLEPLAY',
    impactIndicators: ['Employee engagement', 'Follow-up quality', 'Turnover'],
    levels: buildLevels(
      'leadership',
      [
        [
          ['Give constructive feedback', 'تقديم ملاحظات بناءة'],
          ['Delegate a routine task clearly', 'تفويض مهمة روتينية بوضوح'],
        ],
        [
          ['Run a one-on-one check-in', 'إجراء لقاء فردي دوري'],
          ['Set measurable performance goals', 'تحديد أهداف أداء قابلة للقياس'],
        ],
        [
          ['Address underperformance directly', 'معالجة ضعف الأداء بشكل مباشر'],
          ['Delegate a high-stakes decision', 'تفويض قرار عالي الأهمية'],
        ],
        [
          ['Coach a struggling team member to recovery', 'توجيه عضو فريق متعثر نحو التحسن'],
          ['Build a team performance plan', 'بناء خطة أداء للفريق'],
        ],
      ],
      [
        'Feedback and delegation basics.',
        'Ongoing check-ins and goal setting.',
        'Difficult conversations and high-stakes delegation.',
        'Coaching recovery and team-level planning.',
      ],
      [
        'أساسيات الملاحظات والتفويض.',
        'اللقاءات الدورية وتحديد الأهداف.',
        'المحادثات الصعبة والتفويض عالي الأهمية.',
        'توجيه التعافي والتخطيط على مستوى الفريق.',
      ],
    ),
  },
  {
    key: 'operations',
    nameEn: 'Operations',
    nameAr: 'العمليات',
    descriptionEn:
      'Reinforces procedures, quality, safety and problem solving through on-the-job scenarios.',
    descriptionAr: 'يعزز الإجراءات والجودة والسلامة وحل المشكلات من خلال سيناريوهات عملية.',
    department: 'Operations',
    targetSkills: ['Procedures', 'Quality', 'Safety', 'Problem solving'],
    trainingForm: 'SIMULATION',
    impactIndicators: ['Errors', 'Incidents', 'Rework', 'Compliance'],
    levels: buildLevels(
      'operations',
      [
        [
          ['Follow a standard operating procedure', 'اتباع إجراء تشغيل قياسي'],
          ['Identify a basic safety hazard', 'تحديد خطر سلامة أساسي'],
        ],
        [
          ['Diagnose the cause of a quality defect', 'تشخيص سبب عيب في الجودة'],
          ['Escalate a safety incident correctly', 'تصعيد حادث سلامة بالشكل الصحيح'],
        ],
        [
          ['Redesign a process step to cut rework', 'إعادة تصميم خطوة عملية لتقليل إعادة العمل'],
          ['Lead a root-cause investigation', 'قيادة تحقيق في السبب الجذري'],
        ],
        [
          ['Own compliance for a full process area', 'تحمل مسؤولية الامتثال لمنطقة عملية كاملة'],
          ['Train a peer on a new procedure', 'تدريب زميل على إجراء جديد'],
        ],
      ],
      [
        'Procedure-following and hazard awareness.',
        'Defect diagnosis and incident escalation.',
        'Process improvement and root-cause work.',
        'Compliance ownership and peer training.',
      ],
      [
        'اتباع الإجراءات والوعي بالمخاطر.',
        'تشخيص العيوب وتصعيد الحوادث.',
        'تحسين العمليات وتحليل السبب الجذري.',
        'مسؤولية الامتثال وتدريب الزملاء.',
      ],
    ),
  },
  {
    key: 'hr',
    nameEn: 'Human Resources',
    nameAr: 'الموارد البشرية',
    descriptionEn:
      'Develops interviewing, candidate evaluation and performance management skills through interviews and situational simulation.',
    descriptionAr:
      'يطور مهارات إجراء المقابلات وتقييم المرشحين وإدارة الأداء من خلال مقابلات ومحاكاة مواقف.',
    department: 'Human Resources',
    targetSkills: ['Interviewing', 'Candidate evaluation', 'Performance management'],
    trainingForm: 'SIMULATION',
    impactIndicators: ['Hiring quality', 'Time-to-hire', 'Evaluation consistency'],
    levels: buildLevels(
      'hr',
      [
        [
          ['Ask structured interview questions', 'طرح أسئلة مقابلة منظمة'],
          ['Record objective interview notes', 'تدوين ملاحظات مقابلة موضوعية'],
        ],
        [
          ['Score a candidate against a rubric', 'تقييم مرشح وفق معايير محددة'],
          ['Spot and avoid a common bias', 'اكتشاف وتجنب تحيز شائع'],
        ],
        [
          ['Run a behavioral interview', 'إجراء مقابلة سلوكية'],
          ['Calibrate scores across interviewers', 'معايرة الدرجات بين القائمين بالمقابلات'],
        ],
        [
          ['Design an interview scorecard for a role', 'تصميم بطاقة تقييم مقابلة لوظيفة معينة'],
          ['Coach a hiring manager on evaluation quality', 'توجيه مدير التوظيف حول جودة التقييم'],
        ],
      ],
      [
        'Structured questions and objective notes.',
        'Rubric scoring and bias awareness.',
        'Behavioral interviewing and calibration.',
        'Scorecard design and coaching hiring managers.',
      ],
      [
        'الأسئلة المنظمة والملاحظات الموضوعية.',
        'التقييم وفق المعايير والوعي بالتحيز.',
        'المقابلة السلوكية والمعايرة.',
        'تصميم بطاقة التقييم وتوجيه مدراء التوظيف.',
      ],
    ),
  },
  {
    key: 'finance',
    nameEn: 'Finance',
    nameAr: 'المالية',
    descriptionEn:
      'Builds analysis, budgeting, controls and financial communication skills through practical cases and decisions.',
    descriptionAr:
      'يبني مهارات التحليل والميزانية والضوابط والتواصل المالي من خلال حالات وقرارات عملية.',
    department: 'Finance',
    targetSkills: ['Analysis', 'Budgeting', 'Controls', 'Financial communication'],
    trainingForm: 'CASE',
    impactIndicators: ['Forecast accuracy', 'Closing time', 'Violations'],
    levels: buildLevels(
      'finance',
      [
        [
          ['Read a standard financial statement', 'قراءة قائمة مالية قياسية'],
          ['Apply a basic budget control', 'تطبيق ضابط ميزانية أساسي'],
        ],
        [
          ['Build a departmental budget', 'إعداد ميزانية قسم'],
          ['Explain a variance to a non-finance manager', 'شرح انحراف مالي لمدير غير مالي'],
        ],
        [
          ['Build a rolling forecast', 'إعداد توقع مالي متجدد'],
          ['Identify a control weakness', 'تحديد ضعف في الضوابط الرقابية'],
        ],
        [
          ['Present financial results to leadership', 'عرض النتائج المالية على الإدارة العليا'],
          ['Design a new budget control', 'تصميم ضابط ميزانية جديد'],
        ],
      ],
      [
        'Reading statements and basic controls.',
        'Budget building and variance communication.',
        'Forecasting and control weaknesses.',
        'Executive presentation and control design.',
      ],
      [
        'قراءة القوائم والضوابط الأساسية.',
        'إعداد الميزانية والتواصل حول الانحرافات.',
        'التوقع المالي وضعف الضوابط.',
        'العرض التنفيذي وتصميم الضوابط.',
      ],
    ),
  },
  {
    key: 'procurement',
    nameEn: 'Procurement',
    nameAr: 'المشتريات',
    descriptionEn:
      'Develops negotiation, supplier evaluation and contract management skills through negotiation simulation and bid comparison.',
    descriptionAr:
      'يطور مهارات التفاوض وتقييم الموردين وإدارة العقود من خلال محاكاة تفاوض ومقارنة عروض.',
    department: 'Procurement',
    targetSkills: ['Negotiation', 'Supplier evaluation', 'Contract management'],
    trainingForm: 'SIMULATION',
    impactIndicators: ['Savings', 'Compliance', 'Supplier performance'],
    levels: buildLevels(
      'procurement',
      [
        [
          ['Compare bids against basic criteria', 'مقارنة العروض وفق معايير أساسية'],
          ['Follow the standard procurement policy', 'اتباع سياسة الشراء القياسية'],
        ],
        [
          ['Negotiate a routine supplier contract', 'التفاوض على عقد مورد روتيني'],
          [
            'Evaluate supplier performance against SLA',
            'تقييم أداء المورد وفق اتفاقية مستوى الخدمة',
          ],
        ],
        [
          ['Run a multi-supplier negotiation', 'إدارة تفاوض مع عدة موردين'],
          ['Identify contract risk clauses', 'تحديد بنود المخاطرة في العقد'],
        ],
        [
          ['Negotiate a strategic, high-value contract', 'التفاوض على عقد استراتيجي عالي القيمة'],
          ['Build a supplier scorecard framework', 'بناء إطار بطاقة تقييم للموردين'],
        ],
      ],
      [
        'Bid comparison and policy compliance.',
        'Routine negotiation and SLA evaluation.',
        'Multi-supplier negotiation and contract risk.',
        'Strategic negotiation and scorecard design.',
      ],
      [
        'مقارنة العروض والامتثال للسياسة.',
        'التفاوض الروتيني وتقييم اتفاقية مستوى الخدمة.',
        'التفاوض متعدد الموردين ومخاطر العقود.',
        'التفاوض الاستراتيجي وتصميم بطاقة التقييم.',
      ],
    ),
  },
];

/** Idempotent — upserts by `(organizationId, name)`, safe to re-run (P1-8). */
async function upsertDepartment(organizationId: string, name: string): Promise<string> {
  const department = await prisma.department.upsert({
    where: { organizationId_name: { organizationId, name } },
    create: { organizationId, name },
    update: {},
  });
  return department.id;
}

/** Idempotent — upserts by `(organizationId, key)`, safe to re-run (P1-8). */
export async function seedTracks(organizationId: string): Promise<void> {
  await runWithTenant(organizationId, async () => {
    for (const [trackOrder, track] of TRACKS.entries()) {
      const departmentId = await upsertDepartment(organizationId, track.department);

      const trackRow = await prisma.track.upsert({
        where: { organizationId_key: { organizationId, key: track.key } },
        create: {
          organizationId,
          key: track.key,
          nameEn: track.nameEn,
          nameAr: track.nameAr,
          descriptionEn: track.descriptionEn,
          descriptionAr: track.descriptionAr,
          departmentId,
          targetSkills: track.targetSkills,
          trainingForm: track.trainingForm,
          impactIndicators: track.impactIndicators,
          sortOrder: trackOrder,
        },
        update: {
          nameEn: track.nameEn,
          nameAr: track.nameAr,
          descriptionEn: track.descriptionEn,
          descriptionAr: track.descriptionAr,
          departmentId,
          targetSkills: track.targetSkills,
          trainingForm: track.trainingForm,
          impactIndicators: track.impactIndicators,
          sortOrder: trackOrder,
        },
      });

      for (const [levelOrder, level] of track.levels.entries()) {
        const levelRow = await prisma.level.upsert({
          where: { trackId_key: { trackId: trackRow.id, key: level.key } },
          create: {
            trackId: trackRow.id,
            key: level.key,
            nameEn: level.nameEn,
            nameAr: level.nameAr,
            descriptionEn: level.descriptionEn,
            descriptionAr: level.descriptionAr,
            order: levelOrder,
          },
          update: {
            nameEn: level.nameEn,
            nameAr: level.nameAr,
            descriptionEn: level.descriptionEn,
            descriptionAr: level.descriptionAr,
            order: levelOrder,
          },
        });

        for (const [outcomeOrder, outcome] of level.outcomes.entries()) {
          const existing = await prisma.outcome.findFirst({
            where: { levelId: levelRow.id, order: outcomeOrder },
          });

          const data = {
            levelId: levelRow.id,
            titleEn: outcome.titleEn,
            titleAr: outcome.titleAr,
            descriptionEn: outcome.descriptionEn,
            descriptionAr: outcome.descriptionAr,
            targetSkills: outcome.targetSkills,
            trainingForm: track.trainingForm,
            order: outcomeOrder,
          };

          if (existing) {
            await prisma.outcome.update({ where: { id: existing.id }, data });
          } else {
            await prisma.outcome.create({ data });
          }
        }
      }
    }
  });
}
