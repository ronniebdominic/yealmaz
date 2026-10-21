// Ye-Almaz TV — which component renders which screen id.
import { CommandScreen, EmployeesScreen, PerformanceScreen, PipelineScreen, CriticalScreen, AchievementsScreen } from './screens';

export const SCREEN_META = {
  command: { title: 'Live Command Center', Component: CommandScreen },
  employees: { title: 'Live Employee Wall', Component: EmployeesScreen },
  performance: { title: 'Performance Board', Component: PerformanceScreen },
  pipeline: { title: 'Live Case Pipeline', Component: PipelineScreen },
  critical: { title: 'Critical Cases', Component: CriticalScreen },
  achievements: { title: 'Team Achievements', Component: AchievementsScreen },
};
