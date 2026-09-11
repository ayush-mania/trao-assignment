'use client';
import type { Kit, KitMeta } from '@trao/core';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BriefTab } from './brief-tab';
import { FlashcardsTab } from './flashcards-tab';
import { QuestionsTab } from './questions-tab';
import { RoleTab } from './role-tab';
import { ScheduleTab } from './schedule-tab';

export function KitBuilder({ id, kit, meta }: { id: string; kit: Kit; meta: KitMeta }) {
  return (
    <Tabs defaultValue="questions">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="brief">Brief</TabsTrigger>
        <TabsTrigger value="role">Role</TabsTrigger>
        <TabsTrigger value="questions">Questions ({kit.questions.length})</TabsTrigger>
        <TabsTrigger value="flashcards">Flashcards ({kit.flashcards.length})</TabsTrigger>
        <TabsTrigger value="schedule">Schedule ({kit.schedule.days.length}d)</TabsTrigger>
      </TabsList>
      <TabsContent value="brief" className="pt-4">
        <BriefTab id={id} kit={kit} meta={meta} />
      </TabsContent>
      <TabsContent value="role" className="pt-4">
        <RoleTab kit={kit} />
      </TabsContent>
      <TabsContent value="questions" className="pt-4">
        <QuestionsTab id={id} kit={kit} meta={meta} />
      </TabsContent>
      <TabsContent value="flashcards" className="pt-4">
        <FlashcardsTab id={id} kit={kit} meta={meta} />
      </TabsContent>
      <TabsContent value="schedule" className="pt-4">
        <ScheduleTab id={id} kit={kit} />
      </TabsContent>
    </Tabs>
  );
}
