variable "project_id" { type = string }
variable "region" { type = string }
variable "env" { type = string }
variable "tier" { type = string }
variable "databases" { type = list(string) }
variable "private_network" { type = string default = "" }
