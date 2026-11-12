import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ASSIGNED_ROLES,
  DEPARTMENTS,
  EMPLOYMENT_STATUSES,
  type CreateEmployeeInput,
  type Employee,
} from '../../../types/employee'
import { EmployeeServiceError } from '../services/employeeService'
import {
  createEmployeeRegistrationSchema,
  EMPLOYEE_FIELD_LIMITS,
  type EmployeeFormInput,
  type EmployeeFormOutput,
} from '../validation/employeeSchema'

interface EmployeeRegistrationFormProps {
  existingEmployees: readonly Employee[]
  onRegister: (input: CreateEmployeeInput) => Promise<Employee>
  autoFocusFirstField?: boolean
  canAssignHrAdmin?: boolean
}

const DEFAULT_FORM_VALUES: EmployeeFormInput = {
  employeeId: '',
  fullName: '',
  workEmail: '',
  department: '',
  position: '',
  employmentStatus: 'Active',
  hireDate: '',
  assignedRole: 'Employee',
}

function getInputClasses(hasError: boolean): string {
  const base =
    'mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2'
  return hasError
    ? `${base} border-red-400 focus:border-red-500 focus:ring-red-500`
    : `${base} border-slate-300 focus:border-blue-600 focus:ring-blue-600`
}

export default function EmployeeRegistrationForm({
  existingEmployees,
  onRegister,
  autoFocusFirstField = false,
  canAssignHrAdmin = false,
}: EmployeeRegistrationFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)
  const firstInputRef = useRef<HTMLInputElement | null>(null)
  const assignableRoles = useMemo(
    () =>
      canAssignHrAdmin
        ? ASSIGNED_ROLES
        : ASSIGNED_ROLES.filter((role) => role !== 'HR Admin'),
    [canAssignHrAdmin],
  )

  const schema = useMemo(
    () => createEmployeeRegistrationSchema({ existingEmployees }),
    [existingEmployees],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormInput, unknown, EmployeeFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: 'onSubmit',
  })

  useEffect(() => {
    if (autoFocusFirstField && firstInputRef.current) {
      firstInputRef.current.focus()
    }
  }, [autoFocusFirstField])

  const employeeIdField = register('employeeId')

  async function onSubmit(values: EmployeeFormOutput) {
    setSubmitError(null)
    setSuccessNotice(null)

    try {
      const created = await onRegister({
        employeeId: values.employeeId,
        fullName: values.fullName,
        workEmail: values.workEmail,
        department: values.department,
        position: values.position,
        employmentStatus: values.employmentStatus,
        hireDate: values.hireDate,
        assignedRole: values.assignedRole,
      })

      reset(DEFAULT_FORM_VALUES)
      setSuccessNotice(
        `Registered ${created.fullName} (${created.employeeId}) in demo storage.`,
      )
    } catch (error: unknown) {
      if (error instanceof EmployeeServiceError) {
        if (error.fieldErrors) {
          for (const [field, message] of Object.entries(error.fieldErrors)) {
            if (message) {
              setError(field as keyof EmployeeFormInput, {
                type: 'server',
                message,
              })
            }
          }
        }
        setSubmitError(error.message)
        return
      }

      if (error instanceof Error && error.message.trim().length > 0) {
        setSubmitError(error.message)
        return
      }

      setSubmitError(
        'An unexpected error occurred while registering the employee. Please try again.',
      )
    }
  }

  function handleResetForm() {
    reset(DEFAULT_FORM_VALUES)
    setSubmitError(null)
    setSuccessNotice(null)
  }

  return (
    <section
      aria-labelledby="employee-registration-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="border-b border-slate-200 pb-4">
        <h2
          id="employee-registration-heading"
          className="text-lg font-semibold text-slate-900"
        >
          Register New Employee
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Add an employee record with validated identity, role, and employment
          details. Fields marked with <span className="text-red-600">*</span>{' '}
          are required.
        </p>
      </div>

      {submitError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-medium">Unable to register employee</p>
          <p className="mt-0.5">{submitError}</p>
        </div>
      )}

      {successNotice && (
        <div
          role="status"
          className="mt-4 flex items-start justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <div>
            <p className="font-medium">Registration complete</p>
            <p className="mt-0.5">{successNotice}</p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="rounded px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="employee-id"
              className="block text-sm font-medium text-slate-700"
            >
              Employee ID <span className="text-red-600">*</span>
            </label>
            <input
              id="employee-id"
              type="text"
              maxLength={EMPLOYEE_FIELD_LIMITS.employeeIdMax}
              placeholder="e.g. EMP-1004"
              aria-invalid={Boolean(errors.employeeId)}
              aria-describedby={
                errors.employeeId ? 'employee-id-error' : 'employee-id-hint'
              }
              className={getInputClasses(Boolean(errors.employeeId))}
              {...employeeIdField}
              ref={(element) => {
                employeeIdField.ref(element)
                firstInputRef.current = element
              }}
            />
            {errors.employeeId ? (
              <p
                id="employee-id-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.employeeId.message}
              </p>
            ) : (
              <p id="employee-id-hint" className="mt-1 text-xs text-slate-500">
                Unique identifier (3–{EMPLOYEE_FIELD_LIMITS.employeeIdMax}{' '}
                letters, numbers, hyphens, or underscores).
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="full-name"
              className="block text-sm font-medium text-slate-700"
            >
              Full Name <span className="text-red-600">*</span>
            </label>
            <input
              id="full-name"
              type="text"
              maxLength={EMPLOYEE_FIELD_LIMITS.fullNameMax}
              placeholder="e.g. Morgan Ellis"
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={errors.fullName ? 'full-name-error' : undefined}
              className={getInputClasses(Boolean(errors.fullName))}
              {...register('fullName')}
            />
            {errors.fullName && (
              <p
                id="full-name-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.fullName.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="work-email"
              className="block text-sm font-medium text-slate-700"
            >
              Work Email <span className="text-red-600">*</span>
            </label>
            <input
              id="work-email"
              type="email"
              maxLength={EMPLOYEE_FIELD_LIMITS.workEmailMax}
              placeholder="e.g. morgan.ellis@smarthr.demo"
              aria-invalid={Boolean(errors.workEmail)}
              aria-describedby={
                errors.workEmail ? 'work-email-error' : undefined
              }
              className={getInputClasses(Boolean(errors.workEmail))}
              {...register('workEmail')}
            />
            {errors.workEmail && (
              <p
                id="work-email-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.workEmail.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="hire-date"
              className="block text-sm font-medium text-slate-700"
            >
              Hire Date <span className="text-red-600">*</span>
            </label>
            <input
              id="hire-date"
              type="date"
              aria-invalid={Boolean(errors.hireDate)}
              aria-describedby={errors.hireDate ? 'hire-date-error' : undefined}
              className={getInputClasses(Boolean(errors.hireDate))}
              {...register('hireDate')}
            />
            {errors.hireDate && (
              <p
                id="hire-date-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.hireDate.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="department"
              className="block text-sm font-medium text-slate-700"
            >
              Department <span className="text-red-600">*</span>
            </label>
            <select
              id="department"
              aria-invalid={Boolean(errors.department)}
              aria-describedby={
                errors.department ? 'department-error' : undefined
              }
              className={getInputClasses(Boolean(errors.department))}
              {...register('department')}
            >
              <option value="">Select department</option>
              {DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            {errors.department && (
              <p
                id="department-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.department.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="position"
              className="block text-sm font-medium text-slate-700"
            >
              Position <span className="text-red-600">*</span>
            </label>
            <input
              id="position"
              type="text"
              maxLength={EMPLOYEE_FIELD_LIMITS.positionMax}
              placeholder="e.g. Software Engineer"
              aria-invalid={Boolean(errors.position)}
              aria-describedby={errors.position ? 'position-error' : undefined}
              className={getInputClasses(Boolean(errors.position))}
              {...register('position')}
            />
            {errors.position && (
              <p
                id="position-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.position.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="employment-status"
              className="block text-sm font-medium text-slate-700"
            >
              Employment Status <span className="text-red-600">*</span>
            </label>
            <select
              id="employment-status"
              aria-invalid={Boolean(errors.employmentStatus)}
              aria-describedby={
                errors.employmentStatus ? 'employment-status-error' : undefined
              }
              className={getInputClasses(Boolean(errors.employmentStatus))}
              {...register('employmentStatus')}
            >
              {EMPLOYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            {errors.employmentStatus && (
              <p
                id="employment-status-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.employmentStatus.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="assigned-role"
              className="block text-sm font-medium text-slate-700"
            >
              Assigned Role <span className="text-red-600">*</span>
            </label>
            <select
              id="assigned-role"
              aria-invalid={Boolean(errors.assignedRole)}
              aria-describedby={
                errors.assignedRole ? 'assigned-role-error' : 'assigned-role-hint'
              }
              className={getInputClasses(Boolean(errors.assignedRole))}
              {...register('assignedRole')}
            >
              {assignableRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {errors.assignedRole ? (
              <p
                id="assigned-role-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.assignedRole.message}
              </p>
            ) : !canAssignHrAdmin ? (
              <p id="assigned-role-hint" className="mt-1 text-xs text-slate-500">
                Assigning the HR Admin role requires an existing HR Admin.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={handleResetForm}
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Clear Form
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1"
          >
            {isSubmitting ? 'Registering...' : 'Register Employee'}
          </button>
        </div>
      </form>
    </section>
  )
}

