class Post < Hibana::Record
  table_name "posts"
  primary_key :id
  timestamps true

  attribute :user_id, :integer
  attribute :title, :string
  attribute :views, :integer, default: 0
  attribute :status, :string, default: "draft"

  belongs_to :user

  scope :published, -> { where(status: "published") }
end
