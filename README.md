# KitchOS

A modern, multi-tenant Point of Sale (POS) and kitchen management system designed for fast-paced hospitality and retail operations. Built with Next.js (App Router), Tailwind CSS, and Supabase.

---

## Key Features

- **Role-Based Access Control (RBAC)**:
  - **Owner**: Full access to dashboard analytics, staff provisioning, inventory, recipe BOMs, and sales reports.
  - **Manager**: Access to operational management, inventory tracking, menu modifications, and sales histories.
  - **Cashier**: Streamlined POS terminal interface dedicated solely to active transactions.
- **Dual Authentication System**:
  - **Email + Password**: Direct staff authentication for cashiers and managers.
  - **Passwordless 8-Digit OTP**: Secure one-time password verification via email for administrative access.
- **Staff Provisioning**:
  - In-app staff onboarding modal utilizing Supabase Admin API (`auth.admin.createUser`) to assign tenant-isolated roles without session termination.
- **Dynamic Sidebar Navigation**:
  - Client-side role resolution that displays authorized endpoints and includes an instant session-clearing sign-out trigger.
- **Multi-Tenant Architecture**:
  - Data isolation powered by PostgreSQL Row Level Security (RLS) policies scoped by `tenant_id` and `branch_id`.

---

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Turbopack)
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL, Supabase Auth, Row Level Security)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons / UI**: Lucide React / Custom SVG

---

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher
- A Supabase project instance

### 1. Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd kitchos/kitchos-web
npm install