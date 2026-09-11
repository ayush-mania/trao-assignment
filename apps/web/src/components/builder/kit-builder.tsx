'use client';
import type { Kit, KitMeta } from '@trao/core';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BriefTab } from './brief-tab';
import { FlashcardsTab } from './flashcards-tab';
import { QuestionsTab } from './questions-tab';
import { RoleTab } from './role-tab';
import { ScheduleTab } from './schedule-tab';

const tab =
  'h-full flex-none rounded-none border-0 px-1 text-sm group-data-horizontal/tabs:after:bottom-0 data-active:bg-transparent data-active:shadow-none';

export function KitBuilder({ id, kit, meta }: { id: string; kit: Kit; meta: KitMeta }) {
  return (
    <Tabs defaultValue="questions">
      <div className="sticky top-14 z-20 bg-background/90 backdrop-blur md:top-0">
        <TabsList
          variant="line"
          className="w-full justify-start gap-5 overflow-x-auto border-b p-0 group-data-horizontal/tabs:h-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <TabsTrigger value="brief" className={tab}>
            Brief
          </TabsTrigger>
          <TabsTrigger value="role" className={tab}>
            Role
          </TabsTrigger>
          <TabsTrigger value="questions" className={tab}>
            Questions <Count n={kit.questions.length} />
          </TabsTrigger>
          <TabsTrigger value="flashcards" className={tab}>
            Flashcards <Count n={kit.flashcards.length} />
          </TabsTrigger>
          <TabsTrigger value="schedule" className={tab}>
            Schedule <Count n={kit.schedule.days.length} suffix="d" />
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="brief" className="pt-6">
        <BriefTab id={id} kit={kit} meta={meta} />
      </TabsContent>
      <TabsContent value="role" className="pt-6">
        <RoleTab kit={kit} />
      </TabsContent>
      <TabsContent value="questions" className="pt-6">
        <QuestionsTab id={id} kit={kit} meta={meta} />
      </TabsContent>
      <TabsContent value="flashcards" className="pt-6">
        <FlashcardsTab id={id} kit={kit} meta={meta} />
      </TabsContent>
      <TabsContent value="schedule" className="pt-6">
        <ScheduleTab id={id} kit={kit} />
      </TabsContent>
    </Tabs>
  );
}

function Count({ n, suffix = '' }: { n: number; suffix?: string }) {
  return (
    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[11px] leading-4 tabular-nums text-muted-foreground">
      {n}
      {suffix}
    </span>
  );
}
