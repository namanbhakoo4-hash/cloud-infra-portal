# Cloud Infrastructure Provisioning Portal

A role-based web application designed to simplify cloud infrastructure requests, approvals, and Terraform configuration generation.

The portal allows users to submit infrastructure requirements through a Bill of Materials (BOM), cloud engineers to review requests, and administrators to manage available infrastructure configurations.

## Technologies Used

| Layer | Technology |
|---|---|
| Frontend | React.js, Vite, CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas |
| Authentication | JWT, bcrypt |
| Infrastructure as Code | Terraform |
| Cloud Platform | AWS (EC2 configuration) |
| Version Control | Git and GitHub |

## User Roles

### 1. Admin
- Manage infrastructure master data.
- Add AWS regions, services, and instance types.
- Configure CPU and RAM specifications.
- Enable, disable, and delete master data.

### 2. User
- Create infrastructure BOM requests.
- Select environment, AWS region, and resources.
- Specify instance type, storage, quantity, and justification.
- View request history and approval status.
- Edit and resubmit requests when changes are requested.

### 3. Cloud Engineer
- Review submitted BOM requests.
- Approve, reject, or request changes.
- Add review remarks.
- View Terraform automation results.

## Project Workflow

1. The administrator configures available cloud resources.
2. A user creates and submits a BOM request.
3. A cloud engineer reviews the request.
4. The engineer approves, rejects, or requests modifications.
5. Upon approval, the backend generates Terraform configuration files.
6. Terraform initialization and validation are performed.
7. A simulated Terraform plan is generated.
8. The request and automation results are displayed in the portal.

## Terraform Automation

The project includes a reusable Terraform module for AWS EC2 infrastructure.

Current capabilities:
- Generate Terraform configuration files from approved BOMs.
- Run `terraform init`.
- Run `terraform validate`.
- Generate a simulated Terraform plan for demonstration purposes.

**Important:** The project does not currently provision live AWS infrastructure. Terraform planning is simulated, and `terraform apply` is not executed.

## Project Structure

```text
Cloud-infra-portal/
├── backend/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── server.js
├── frontend/
│   ├── public/
│   └── src/
│       ├── pages/
│       ├── App.jsx
│       └── main.jsx
├── terraform/
│   └── modules/
│       └── ec2/
├── .gitignore
└── README.md
```

## Running the Project Locally

### Prerequisites

- Node.js and npm
- MongoDB Atlas database
- Terraform CLI
- Git

### Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` folder and configure the environment variables expected by the application, including your MongoDB connection string and JWT secret.

Do not commit `.env` or share real credentials.

Start the backend:

```bash
node server.js
```

The backend runs at:

`http://localhost:5000`

### Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

`http://localhost:5173`

## Security Features

- JWT-based authentication.
- Password hashing using bcrypt.
- Role-based access control.
- Protected backend routes.
- Environment variables for sensitive configuration.
- Git ignore rules for credentials, dependencies, and Terraform state.

## Current Project Status

The core frontend, backend, BOM approval workflow, and Terraform automation integration have been implemented.

End-to-end testing, additional validation, documentation, and final demonstration preparation are ongoing.

## Future Enhancements

- Real AWS infrastructure provisioning.
- Terraform plan and apply using authorized AWS credentials.
- Infrastructure lifecycle operations.
- Improved audit logging.
- Automated testing.
- Deployment of the frontend and backend.

## Disclaimer

This project is currently a development prototype. Terraform plan output is simulated, and no live AWS resources are deployed through the application.

## Development Workflow

This project uses Git and GitHub for version control.

New features are developed in separate branches,
reviewed through pull requests, and merged into main.

## Project Features

- User authentication and role-based access
- Cloud infrastructure request management
- Bill of Materials (BOM) generation
- Infrastructure approval workflows
- Terraform mock plan generation