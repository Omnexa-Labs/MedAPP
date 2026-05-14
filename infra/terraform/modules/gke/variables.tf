variable "project_id" { type = string }
variable "region" { type = string }
variable "env" { type = string }
variable "network" { type = string }
variable "subnetwork" { type = string }
variable "node_pool_cpu_machine_type" { type = string }
variable "enable_gpu_pool" { type = bool default = false }
