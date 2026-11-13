export const DEPARTMENTS = [
  'Engineering',
  'Human Resources',
  'Finance',
  'Operations',
  'Product',
  'Sales',
  'Customer Support',
] as const

export type Department = (typeof DEPARTMENTS)[number]

export const EMPLOYMENT_STATUSES = [
  'Active',
  'Probation',
  'On Leave',
  'Inactive',
] as const

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

export const ASSIGNED_ROLES = [
  'Employee',
  'Manager',
  'HR Coordinator',
  'HR Admin',
] as const

export type AssignedRole = (typeof ASSIGNED_ROLES)[number]

export interface Employee {
  id: string
  employeeId: string
  fullName: string
  workEmail: string
  department: Department
  position: string
  employmentStatus: EmploymentStatus
  hireDate: string
  assignedRole: AssignedRole
  createdAt: string
}

export interface CreateEmployeeInput {
  employeeId: string
  fullName: string
  workEmail: string
  department: Department
  position: string
  employmentStatus: EmploymentStatus
  hireDate: string
  assignedRole: AssignedRole
}

export interface UpdateEmployeeInput {
  targetEmployeeId: string
  fullName?: string
  workEmail?: string
  department?: Department
  position?: string
  employmentStatus?: EmploymentStatus
  hireDate?: string
}

