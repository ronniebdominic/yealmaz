// Ye-Almaz TV — which component renders which screen id.
import { DispatchScreen, StatusBoardScreen, HrScreen, DeliveryScreen, LabScansScreen } from './screens2';
import { CommandScreen, EmployeesScreen, PerformanceScreen, PipelineScreen, CriticalScreen, AchievementsScreen } from './screens';

export const SCREEN_META = {
  command: { title: 'Live Command Center', Component: CommandScreen },
  dispatch: { title: 'Dispatch Flow', Component: DispatchScreen },
  statusboard: { title: 'Live Case Status Board', Component: StatusBoardScreen },
  employees: { title: 'Live Employee Wall', Component: EmployeesScreen },
  labscans: { title: 'Lab Scans Today', Component: LabScansScreen },
  hr: { title: 'HR · Attendance Today', Component: HrScreen },
  delivery: { title: 'Delivery Performance', Component: DeliveryScreen },
  performance: { title: 'Performance Board', Component: PerformanceScreen },
  pipeline: { title: 'Live Case Pipeline', Component: PipelineScreen },
  critical: { title: 'Critical Cases', Component: CriticalScreen },
  achievements: { title: 'Team Achievements', Component: AchievementsScreen },
};
